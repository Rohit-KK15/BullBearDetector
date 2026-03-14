import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  insertFeatures,
  insertRegimeScores,
  queryHistory,
} from './clickhouse.js';
import type { FeatureSnapshot, RegimeScore } from '@bull-bear/shared';

// Minimal mock ClickHouseClient
function makeClient() {
  const insertMock = vi.fn().mockResolvedValue(undefined);
  const queryMock = vi.fn();
  return {
    insert: insertMock,
    query: queryMock,
    insertMock,
    queryMock,
  };
}

const baseTs = 1_700_000_000_000;

const sampleFeature: FeatureSnapshot = {
  asset: 'BTC',
  momentum: 0.5,
  ofi: -0.2,
  depthImb: 0.1,
  fundingSentiment: 0.3,
  volatilityPercentile: 0.6,
  volumeRatio: 1.2,
  volConfidence: 0.8,
  volumeConfidence: 0.9,
  direction: 0.4,
  conviction: 0.7,
  ts: baseTs,
};

const sampleRegime: RegimeScore = {
  asset: 'ETH',
  score: 0.45,
  label: 'bull',
  direction: {
    momentum: 0.5,
    flow: -0.1,
    depth: 0.2,
    funding: 0.3,
  },
  conviction: {
    volConfidence: 0.8,
    volumeConfidence: 0.9,
    signalAgreement: 0.75,
  },
  ts: baseTs,
};

describe('insertFeatures', () => {
  it('calls client.insert with the features table and correct column mapping', async () => {
    const { insert, insertMock } = makeClient();
    await insertFeatures({ insert } as any, [sampleFeature]);

    expect(insertMock).toHaveBeenCalledOnce();
    const call = insertMock.mock.calls[0][0];

    expect(call.table).toBe('features');
    expect(call.format).toBe('JSONEachRow');

    const row = call.values[0];
    // camelCase → snake_case mapping
    expect(row.order_flow_imbalance).toBe(sampleFeature.ofi);
    expect(row.depth_imbalance).toBe(sampleFeature.depthImb);
    expect(row.funding_sentiment).toBe(sampleFeature.fundingSentiment);
    expect(row.volatility_percentile).toBe(sampleFeature.volatilityPercentile);
    expect(row.volume_ratio).toBe(sampleFeature.volumeRatio);
    expect(row.momentum).toBe(sampleFeature.momentum);
    expect(row.direction).toBe(sampleFeature.direction);
    expect(row.conviction).toBe(sampleFeature.conviction);
    expect(row.asset).toBe('BTC');
  });

  it('skips insert when rows array is empty', async () => {
    const { insert, insertMock } = makeClient();
    await insertFeatures({ insert } as any, []);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('handles multiple rows', async () => {
    const { insert, insertMock } = makeClient();
    const second: FeatureSnapshot = { ...sampleFeature, asset: 'SOL', ts: baseTs + 5000 };
    await insertFeatures({ insert } as any, [sampleFeature, second]);

    const call = insertMock.mock.calls[0][0];
    expect(call.values).toHaveLength(2);
    expect(call.values[1].asset).toBe('SOL');
  });
});

describe('insertRegimeScores', () => {
  it('calls client.insert with the regime_scores table and flattened columns', async () => {
    const { insert, insertMock } = makeClient();
    await insertRegimeScores({ insert } as any, [sampleRegime]);

    expect(insertMock).toHaveBeenCalledOnce();
    const call = insertMock.mock.calls[0][0];

    expect(call.table).toBe('regime_scores');
    expect(call.format).toBe('JSONEachRow');

    const row = call.values[0];
    // Flattened direction components
    expect(row.momentum_component).toBe(sampleRegime.direction.momentum);
    expect(row.flow_component).toBe(sampleRegime.direction.flow);
    expect(row.depth_component).toBe(sampleRegime.direction.depth);
    expect(row.funding_component).toBe(sampleRegime.direction.funding);
    // Sum of direction components
    const expectedDirection =
      sampleRegime.direction.momentum +
      sampleRegime.direction.flow +
      sampleRegime.direction.depth +
      sampleRegime.direction.funding;
    expect(row.direction).toBeCloseTo(expectedDirection);
    // Product of conviction factors
    const expectedConviction =
      sampleRegime.conviction.volConfidence *
      sampleRegime.conviction.volumeConfidence *
      sampleRegime.conviction.signalAgreement;
    expect(row.conviction).toBeCloseTo(expectedConviction);
    // Individual conviction factors
    expect(row.vol_confidence).toBe(sampleRegime.conviction.volConfidence);
    expect(row.volume_confidence).toBe(sampleRegime.conviction.volumeConfidence);
    expect(row.signal_agreement).toBe(sampleRegime.conviction.signalAgreement);
    // Top-level fields
    expect(row.score).toBe(sampleRegime.score);
    expect(row.label).toBe('bull');
    expect(row.asset).toBe('ETH');
  });

  it('skips insert when rows array is empty', async () => {
    const { insert, insertMock } = makeClient();
    await insertRegimeScores({ insert } as any, []);
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe('queryHistory', () => {
  it('returns bull label when avg_score > 0.3', async () => {
    const mockRow = { bucket_ts: '2023-11-14 22:13:20', avg_score: '0.5' };
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([mockRow]) });

    const results = await queryHistory({ query } as any, 'BTC', baseTs - 60000, baseTs, '1m');

    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('bull');
    expect(results[0].score).toBeCloseTo(0.5);
  });

  it('returns bear label when avg_score < -0.3', async () => {
    const mockRow = { bucket_ts: '2023-11-14 22:13:20', avg_score: '-0.5' };
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([mockRow]) });

    const results = await queryHistory({ query } as any, 'ETH', baseTs - 60000, baseTs, '5m');

    expect(results[0].label).toBe('bear');
    expect(results[0].score).toBeCloseTo(-0.5);
  });

  it('returns neutral label when avg_score is between thresholds', async () => {
    const mockRow = { bucket_ts: '2023-11-14 22:13:20', avg_score: '0.1' };
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([mockRow]) });

    const results = await queryHistory({ query } as any, 'SOL', baseTs - 60000, baseTs, '15m');

    expect(results[0].label).toBe('neutral');
    expect(results[0].score).toBeCloseTo(0.1);
  });

  it('handles numeric avg_score (not string)', async () => {
    const mockRow = { bucket_ts: '2023-11-14 22:13:20', avg_score: 0.35 };
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([mockRow]) });

    const results = await queryHistory({ query } as any, 'BTC', baseTs - 60000, baseTs, '1h');

    expect(results[0].label).toBe('bull');
    expect(results[0].score).toBeCloseTo(0.35);
  });

  it('returns empty array when no rows are returned', async () => {
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([]) });

    const results = await queryHistory({ query } as any, 'BTC', baseTs - 60000, baseTs, '1d');

    expect(results).toHaveLength(0);
  });

  it('returns ts as a number (milliseconds)', async () => {
    const mockRow = { bucket_ts: '2023-11-14 22:13:20', avg_score: '0.4' };
    const { query, queryMock } = makeClient();
    queryMock.mockResolvedValue({ json: vi.fn().mockResolvedValue([mockRow]) });

    const results = await queryHistory({ query } as any, 'BTC', baseTs - 60000, baseTs, '5s');

    expect(typeof results[0].ts).toBe('number');
    expect(results[0].ts).toBe(new Date('2023-11-14T22:13:20Z').getTime());
  });
});
