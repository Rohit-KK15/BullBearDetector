import type { Redis } from 'ioredis';
import type { ClickHouseClient } from '@clickhouse/client';
import { ASSETS, STREAM_KEYS, REDIS_STATE_KEYS, type FeatureSnapshot, type RegimeScore } from '@bull-bear/shared';
import { createConsumerGroup, readFromStream, ackMessage, publishToStream, setState } from '../storage/redis.js';
import { insertFeatures, insertRegimeScores } from '../storage/clickhouse.js';
import { computeRegimeScore } from './score.js';

// Flatten RegimeScore for XADD (flat scalars only)
function flattenRegimeScore(r: RegimeScore): Record<string, string | number> {
  return {
    asset: r.asset,
    score: r.score,
    label: r.label,
    price: r.price,
    direction: r.direction.momentum + r.direction.flow + r.direction.depth + r.direction.funding,
    conviction: r.conviction.volConfidence * r.conviction.volumeConfidence * r.conviction.signalAgreement,
    momentumComp: r.direction.momentum,
    flowComp: r.direction.flow,
    depthComp: r.direction.depth,
    fundingComp: r.direction.funding,
    volConf: r.conviction.volConfidence,
    volumeConf: r.conviction.volumeConfidence,
    sigAgree: r.conviction.signalAgreement,
    ts: r.ts,
  };
}

function parseFeatureSnapshot(fields: Record<string, string>): FeatureSnapshot {
  return {
    asset: fields.asset as FeatureSnapshot['asset'],
    momentum: parseFloat(fields.momentum),
    ofi: parseFloat(fields.ofi),
    depthImb: parseFloat(fields.depthImb),
    fundingSentiment: parseFloat(fields.fundingSentiment),
    volatilityPercentile: parseFloat(fields.volatilityPercentile),
    volumeRatio: parseFloat(fields.volumeRatio),
    volConfidence: parseFloat(fields.volConfidence),
    volumeConfidence: parseFloat(fields.volumeConfidence),
    direction: parseFloat(fields.direction),
    conviction: parseFloat(fields.conviction),
    markPrice: parseFloat(fields.markPrice || '0'),
    ts: parseFloat(fields.ts),
  };
}

const GROUP = 'regime-engine';
const CONSUMER = 'regime-0';

export async function startRegimeEngine(redis: Redis, clickhouse: ClickHouseClient): Promise<void> {
  // Create consumer groups for feature streams
  for (const asset of ASSETS) {
    await createConsumerGroup(redis, STREAM_KEYS.features(asset), GROUP);
  }

  // Batch buffers for ClickHouse inserts (shared by reference with consumers)
  const featureBatch: FeatureSnapshot[] = [];
  const regimeBatch: RegimeScore[] = [];

  // Flush to ClickHouse every 10 seconds
  setInterval(async () => {
    if (featureBatch.length > 0) {
      const batch = featureBatch.splice(0);
      await insertFeatures(clickhouse, batch).catch(console.error);
    }
    if (regimeBatch.length > 0) {
      const batch = regimeBatch.splice(0);
      await insertRegimeScores(clickhouse, batch).catch(console.error);
    }
  }, 10_000);

  // Consume feature streams
  for (const asset of ASSETS) {
    consumeFeatureStream(redis, asset, featureBatch, regimeBatch);
  }
}

async function consumeFeatureStream(
  redis: Redis, asset: string,
  featureBatch: FeatureSnapshot[], regimeBatch: RegimeScore[]
) {
  const streamKey = STREAM_KEYS.features(asset as Parameters<typeof STREAM_KEYS.features>[0]);
  while (true) {
    try {
      const messages = await readFromStream(redis, streamKey, GROUP, CONSUMER, 10, 5000);
      if (!messages) continue;

      for (const msg of messages) {
        const features = parseFeatureSnapshot(msg.fields);
        const regimeScore = computeRegimeScore(features);

        // Publish to regime stream (flattened)
        await publishToStream(redis, STREAM_KEYS.regime(features.asset), flattenRegimeScore(regimeScore));

        // Store nested JSON for API reads
        await setState(redis, REDIS_STATE_KEYS.regime(features.asset), regimeScore);

        // Buffer for ClickHouse
        featureBatch.push(features);
        regimeBatch.push(regimeScore);

        await ackMessage(redis, streamKey, GROUP, msg.id);
      }
    } catch (err) {
      console.error(`Regime engine error for ${asset}:`, err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
