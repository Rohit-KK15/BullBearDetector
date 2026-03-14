import type { Redis } from 'ioredis';
import {
  ASSETS, TICK_INTERVAL_MS, STREAM_KEYS, REDIS_STATE_KEYS,
  DIRECTION_WEIGHTS, type Asset, type FeatureSnapshot,
  type Trade, type DepthSnapshot, type FundingUpdate,
} from '@bull-bear/shared';
import { publishToStream, setState, createConsumerGroup, readFromStream, ackMessage } from '../storage/redis.js';
import {
  MomentumAccumulator, OrderFlowAccumulator, DepthAccumulator,
  FundingAccumulator, VolatilityAccumulator, VolumeAccumulator,
} from './accumulators.js';

interface AssetAccumulators {
  momentum: MomentumAccumulator;
  orderFlow: OrderFlowAccumulator;
  depth: DepthAccumulator;
  funding: FundingAccumulator;
  volatility: VolatilityAccumulator;
  volume: VolumeAccumulator;
  lastPrice: number;    // used for volatility log returns (sampled at 5s tick)
  markPrice: number;    // latest mark price from funding stream
}

function createAccumulators(): AssetAccumulators {
  return {
    momentum: new MomentumAccumulator(),
    orderFlow: new OrderFlowAccumulator(),
    depth: new DepthAccumulator(),
    funding: new FundingAccumulator(),
    volatility: new VolatilityAccumulator(),
    volume: new VolumeAccumulator(),
    lastPrice: 0,
    markPrice: 0,
  };
}

const GROUP = 'feature-engine';
const CONSUMER = 'feature-0';

export async function startFeatureEngine(redis: Redis): Promise<void> {
  const accumulators = new Map<Asset, AssetAccumulators>();
  for (const asset of ASSETS) {
    accumulators.set(asset, createAccumulators());
    // Create consumer groups for raw streams
    await createConsumerGroup(redis, STREAM_KEYS.trades(asset), GROUP);
    await createConsumerGroup(redis, STREAM_KEYS.depth(asset), GROUP);
    await createConsumerGroup(redis, STREAM_KEYS.funding(asset), GROUP);
  }

  // Consume raw streams (background loops)
  for (const asset of ASSETS) {
    consumeTradeStream(redis, asset, accumulators.get(asset)!);
    consumeDepthStream(redis, asset, accumulators.get(asset)!);
    consumeFundingStream(redis, asset, accumulators.get(asset)!);
  }

  // Volume accumulator tick (every 60s)
  setInterval(() => {
    for (const asset of ASSETS) {
      accumulators.get(asset)!.volume.tick();
    }
  }, 60_000);

  // Emit features every 5s — also sample mark price for momentum + volatility
  setInterval(async () => {
    for (const asset of ASSETS) {
      const acc = accumulators.get(asset)!;

      // Sample mark price at 5s cadence for momentum and volatility
      // (spec: use mark price, not trade price, sampled at tick interval)
      if (acc.markPrice > 0) {
        acc.momentum.addPrice(acc.markPrice);
        if (acc.lastPrice > 0) {
          acc.volatility.addReturn(Math.log(acc.markPrice / acc.lastPrice));
        }
        acc.lastPrice = acc.markPrice;
      }

      const snapshot = computeFeatureSnapshot(asset, acc);
      await publishToStream(redis, STREAM_KEYS.features(asset), snapshot as any);
      await setState(redis, REDIS_STATE_KEYS.features(asset), snapshot);
    }
  }, TICK_INTERVAL_MS);
}

function computeFeatureSnapshot(asset: Asset, acc: AssetAccumulators): FeatureSnapshot {
  const momentum = acc.momentum.compute();
  const ofi = acc.orderFlow.compute();
  const depthImb = acc.depth.compute();
  const fundingSentiment = acc.funding.compute();

  const { realizedVol, volPercentile, volConfidence } = acc.volatility.compute();
  const { volumeRatio, volumeConfidence } = acc.volume.compute();

  // Direction = weighted sum
  const direction =
    DIRECTION_WEIGHTS.momentum * momentum +
    DIRECTION_WEIGHTS.orderFlow * ofi +
    DIRECTION_WEIGHTS.depth * depthImb +
    DIRECTION_WEIGHTS.funding * fundingSentiment;

  // Conviction = product of all factors
  // Signal agreement is computed by regime engine, not here
  const conviction = volConfidence * volumeConfidence;

  return {
    asset,
    momentum,
    ofi,
    depthImb,
    fundingSentiment,
    volatilityPercentile: volPercentile,
    volumeRatio,
    volConfidence,
    volumeConfidence,
    direction,
    conviction,
    ts: Date.now(),
  };
}

async function consumeTradeStream(redis: Redis, asset: Asset, acc: AssetAccumulators) {
  const streamKey = STREAM_KEYS.trades(asset);
  while (true) {
    try {
      const messages = await readFromStream(redis, streamKey, GROUP, CONSUMER, 100, 2000);
      if (!messages) continue;
      for (const msg of messages) {
        const trade: Trade = {
          asset: msg.fields.asset as Asset,
          exchange: msg.fields.exchange as any,
          price: Number(msg.fields.price),
          qty: Number(msg.fields.qty),
          side: msg.fields.side as any,
          ts: Number(msg.fields.ts),
        };
        acc.orderFlow.addTrade(trade);
        acc.volume.addTrade(trade);
        // Mark price for momentum/volatility is sampled at 5s tick, not per-trade

        await ackMessage(redis, streamKey, GROUP, msg.id);
      }
    } catch (err) {
      console.error(`Feature engine trade error for ${asset}:`, err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function consumeDepthStream(redis: Redis, asset: Asset, acc: AssetAccumulators) {
  const streamKey = STREAM_KEYS.depth(asset);
  while (true) {
    try {
      const messages = await readFromStream(redis, streamKey, GROUP, CONSUMER, 10, 2000);
      if (!messages) continue;
      for (const msg of messages) {
        // Depth snapshots are JSON-stringified, parse them
        const snapshot: DepthSnapshot = {
          asset: msg.fields.asset as Asset,
          exchange: msg.fields.exchange as any,
          bids: JSON.parse(msg.fields.bids || '[]'),
          asks: JSON.parse(msg.fields.asks || '[]'),
          ts: Number(msg.fields.ts),
        };
        acc.depth.updateDepth(snapshot);
        await ackMessage(redis, streamKey, GROUP, msg.id);
      }
    } catch (err) {
      console.error(`Feature engine depth error for ${asset}:`, err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function consumeFundingStream(redis: Redis, asset: Asset, acc: AssetAccumulators) {
  const streamKey = STREAM_KEYS.funding(asset);
  while (true) {
    try {
      const messages = await readFromStream(redis, streamKey, GROUP, CONSUMER, 10, 2000);
      if (!messages) continue;
      for (const msg of messages) {
        const update: FundingUpdate = {
          asset: msg.fields.asset as Asset,
          exchange: msg.fields.exchange as any,
          rate: Number(msg.fields.rate),
          markPrice: Number(msg.fields.markPrice),
          ts: Number(msg.fields.ts),
        };
        acc.funding.updateFunding(update);
        // Store mark price for sampling at 5s tick
        if (update.markPrice > 0) {
          acc.markPrice = update.markPrice;
        }
        await ackMessage(redis, streamKey, GROUP, msg.id);
      }
    } catch (err) {
      console.error(`Feature engine funding error for ${asset}:`, err);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
