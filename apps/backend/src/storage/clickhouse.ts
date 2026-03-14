import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import type { FeatureSnapshot, RegimeScore, Asset, HistoryPoint, RegimeLabel } from '@bull-bear/shared';
import { REGIME_THRESHOLDS } from '@bull-bear/shared';
import type { Interval } from '@bull-bear/shared';

export { ClickHouseClient };

export function createClickHouseClient(config: { url: string; database: string }): ClickHouseClient {
  return createClient({
    url: config.url,
    database: config.database,
  });
}

interface FeatureRow {
  ts: string;
  asset: string;
  momentum: number;
  order_flow_imbalance: number;
  depth_imbalance: number;
  funding_sentiment: number;
  volatility_percentile: number;
  volume_ratio: number;
  direction: number;
  conviction: number;
}

interface RegimeScoreRow {
  ts: string;
  asset: string;
  score: number;
  label: string;
  momentum_component: number;
  flow_component: number;
  depth_component: number;
  funding_component: number;
  direction: number;
  conviction: number;
  vol_confidence: number;
  volume_confidence: number;
  signal_agreement: number;
}

/**
 * Batch insert FeatureSnapshot rows into the `features` table.
 * Maps camelCase fields to snake_case columns.
 */
export async function insertFeatures(
  client: ClickHouseClient,
  rows: FeatureSnapshot[],
): Promise<void> {
  if (rows.length === 0) return;

  const mapped: FeatureRow[] = rows.map((r) => ({
    ts: new Date(r.ts).toISOString().replace('T', ' ').replace('Z', ''),
    asset: r.asset,
    momentum: r.momentum,
    order_flow_imbalance: r.ofi,
    depth_imbalance: r.depthImb,
    funding_sentiment: r.fundingSentiment,
    volatility_percentile: r.volatilityPercentile,
    volume_ratio: r.volumeRatio,
    direction: r.direction,
    conviction: r.conviction,
  }));

  await client.insert({
    table: 'features',
    values: mapped,
    format: 'JSONEachRow',
  });
}

/**
 * Batch insert RegimeScore rows into the `regime_scores` table.
 * Flattens nested direction/conviction objects to flat columns.
 */
export async function insertRegimeScores(
  client: ClickHouseClient,
  rows: RegimeScore[],
): Promise<void> {
  if (rows.length === 0) return;

  const mapped: RegimeScoreRow[] = rows.map((r) => ({
    ts: new Date(r.ts).toISOString().replace('T', ' ').replace('Z', ''),
    asset: r.asset,
    score: r.score,
    label: r.label,
    momentum_component: r.direction.momentum,
    flow_component: r.direction.flow,
    depth_component: r.direction.depth,
    funding_component: r.direction.funding,
    direction: r.direction.momentum + r.direction.flow + r.direction.depth + r.direction.funding,
    conviction: r.conviction.volConfidence * r.conviction.volumeConfidence * r.conviction.signalAgreement,
    vol_confidence: r.conviction.volConfidence,
    volume_confidence: r.conviction.volumeConfidence,
    signal_agreement: r.conviction.signalAgreement,
  }));

  await client.insert({
    table: 'regime_scores',
    values: mapped,
    format: 'JSONEachRow',
  });
}

function deriveLabel(avgScore: number): RegimeLabel {
  if (avgScore > REGIME_THRESHOLDS.bull) return 'bull';
  if (avgScore < REGIME_THRESHOLDS.bear) return 'bear';
  return 'neutral';
}

interface QueryHistoryRow {
  bucket_ts: string;
  avg_score: string | number;
}

/**
 * Query time-bucketed regime score history for a given asset and time range.
 */
export async function queryHistory(
  client: ClickHouseClient,
  asset: Asset,
  from: number,
  to: number,
  interval: Interval,
): Promise<HistoryPoint[]> {
  const fromTs = new Date(from).toISOString().replace('T', ' ').replace('Z', '');
  const toTs = new Date(to).toISOString().replace('T', ' ').replace('Z', '');

  const query = `
    SELECT
      toStartOfInterval(ts, INTERVAL ${interval}) as bucket_ts,
      avg(score) as avg_score
    FROM bullbear.regime_scores
    WHERE asset = '${asset}' AND ts >= '${fromTs}' AND ts <= '${toTs}'
    GROUP BY bucket_ts
    ORDER BY bucket_ts
  `;

  const result = await client.query({
    query,
    format: 'JSONEachRow',
  });

  const rows = await result.json<QueryHistoryRow>();

  return rows.map((row) => {
    const avgScore = typeof row.avg_score === 'string' ? parseFloat(row.avg_score) : row.avg_score;
    const bucketTs = new Date(row.bucket_ts.replace(' ', 'T') + 'Z').getTime();
    return {
      ts: bucketTs,
      score: avgScore,
      label: deriveLabel(avgScore),
    };
  });
}
