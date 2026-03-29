import { createClient } from '@clickhouse/client';
import type { ClickHouseClient } from '@clickhouse/client';
import type { FeatureSnapshot, RegimeScore, Asset, HistoryPoint, RegimeLabel, RegimeTransition } from '@bull-bear/shared';
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
  price: number;
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
    price: r.price,
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
// Map validated Interval values to ClickHouse INTERVAL expressions
const INTERVAL_MAP: Record<Interval, string> = {
  '5s': '5 SECOND',
  '1m': '1 MINUTE',
  '5m': '5 MINUTE',
  '15m': '15 MINUTE',
  '1h': '1 HOUR',
  '1d': '1 DAY',
};

export async function queryHistory(
  client: ClickHouseClient,
  asset: Asset,
  from: number,
  to: number,
  interval: Interval,
): Promise<HistoryPoint[]> {
  const fromTs = new Date(from).toISOString().replace('T', ' ').replace('Z', '');
  const toTs = new Date(to).toISOString().replace('T', ' ').replace('Z', '');
  const chInterval = INTERVAL_MAP[interval];

  const query = `
    SELECT
      toStartOfInterval(ts, INTERVAL ${chInterval}) as bucket_ts,
      avg(score) as avg_score
    FROM bullbear.regime_scores
    WHERE asset = {asset:String} AND ts >= {from_ts:String} AND ts <= {to_ts:String}
    GROUP BY bucket_ts
    ORDER BY bucket_ts
  `;

  const result = await client.query({
    query,
    query_params: {
      asset,
      from_ts: fromTs,
      to_ts: toTs,
    },
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

interface TransitionRow {
  ts: string;
  asset: string;
  label: string;
  prev_label: string;
  score: string | number;
  conviction: string | number;
}

export async function queryRegimeTransitions(
  client: ClickHouseClient,
  asset: Asset,
  hours: number = 24,
): Promise<RegimeTransition[]> {
  const query = `
    SELECT ts, asset, label, prev_label, score, conviction
    FROM (
      SELECT
        ts, asset, label, score, conviction,
        lagInFrame(label) OVER (PARTITION BY asset ORDER BY ts) AS prev_label
      FROM bullbear.regime_scores
      WHERE asset = {asset:String}
        AND ts >= now() - INTERVAL {hours:UInt32} HOUR
    )
    WHERE label != prev_label AND prev_label != ''
    ORDER BY ts DESC
    LIMIT 50
  `;

  const result = await client.query({
    query,
    query_params: { asset, hours },
    format: 'JSONEachRow',
  });

  const rows = await result.json<TransitionRow>();

  return rows.map((row) => ({
    ts: new Date(row.ts.replace(' ', 'T') + 'Z').getTime(),
    asset: row.asset as Asset,
    fromLabel: row.prev_label as RegimeLabel,
    toLabel: row.label as RegimeLabel,
    score: typeof row.score === 'string' ? parseFloat(row.score) : row.score,
    conviction: typeof row.conviction === 'string' ? parseFloat(row.conviction) : row.conviction,
  }));
}

interface PriceHistoryRow {
  bucket_ts: string;
  avg_price: string | number;
  min_price: string | number;
  max_price: string | number;
}

export interface PricePoint {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export async function queryPriceHistory(
  client: ClickHouseClient,
  asset: Asset,
  from: number,
  to: number,
  interval: Interval,
): Promise<PricePoint[]> {
  const fromTs = new Date(from).toISOString().replace('T', ' ').replace('Z', '');
  const toTs = new Date(to).toISOString().replace('T', ' ').replace('Z', '');
  const chInterval = INTERVAL_MAP[interval];

  const query = `
    SELECT
      toStartOfInterval(ts, INTERVAL ${chInterval}) as bucket_ts,
      argMin(price, ts) as open_price,
      max(price) as max_price,
      min(price) as min_price,
      argMax(price, ts) as close_price
    FROM bullbear.regime_scores
    WHERE asset = {asset:String} AND ts >= {from_ts:String} AND ts <= {to_ts:String}
      AND price > 0
    GROUP BY bucket_ts
    ORDER BY bucket_ts
  `;

  const result = await client.query({
    query,
    query_params: { asset, from_ts: fromTs, to_ts: toTs },
    format: 'JSONEachRow',
  });

  const rows = await result.json<{ bucket_ts: string; open_price: string | number; max_price: string | number; min_price: string | number; close_price: string | number }>();

  return rows.map((row) => {
    const bucketTs = new Date(row.bucket_ts.replace(' ', 'T') + 'Z').getTime();
    return {
      ts: bucketTs,
      open: typeof row.open_price === 'string' ? parseFloat(row.open_price) : row.open_price,
      high: typeof row.max_price === 'string' ? parseFloat(row.max_price) : row.max_price,
      low: typeof row.min_price === 'string' ? parseFloat(row.min_price) : row.min_price,
      close: typeof row.close_price === 'string' ? parseFloat(row.close_price) : row.close_price,
    };
  });
}
