import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createServer } from './server.js';
import type { Redis } from 'ioredis';
import type { ClickHouseClient } from '@clickhouse/client';

// Mock storage modules
vi.mock('../storage/redis.js', () => ({
  getState: vi.fn(),
}));

vi.mock('../storage/clickhouse.js', () => ({
  queryHistory: vi.fn(),
}));

import { getState } from '../storage/redis.js';
import { queryHistory } from '../storage/clickhouse.js';

const mockGetState = vi.mocked(getState);
const mockQueryHistory = vi.mocked(queryHistory);

const mockRedis = {} as Redis;
const mockClickhouse = {} as ClickHouseClient;

const mockRegimeBTC = { asset: 'BTC', label: 'bull', score: 0.6, ts: 1000000 };
const mockRegimeETH = { asset: 'ETH', label: 'neutral', score: 0.1, ts: 1000000 };
const mockFeaturesBTC = {
  asset: 'BTC',
  ts: 1000000,
  momentum: 0.5,
  ofi: 0.2,
  depthImb: 0.1,
  fundingSentiment: 0.05,
  volatilityPercentile: 0.4,
  volumeRatio: 1.2,
  direction: 0.3,
  conviction: 0.8,
};

describe('REST API routes', () => {
  let app: Awaited<ReturnType<typeof createServer>>;

  beforeAll(async () => {
    app = await createServer(mockRedis, mockClickhouse);
  });

  describe('GET /api/regime', () => {
    it('returns data array with all available asset regimes', async () => {
      mockGetState.mockImplementation(async (_redis, key) => {
        if (key === 'state:regime:BTC') return mockRegimeBTC;
        if (key === 'state:regime:ETH') return mockRegimeETH;
        return null;
      });

      const response = await app.inject({ method: 'GET', url: '/api/regime' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data).toHaveLength(2);
      expect(body.data).toContainEqual(mockRegimeBTC);
      expect(body.data).toContainEqual(mockRegimeETH);
    });

    it('returns empty data array when no assets have state', async () => {
      mockGetState.mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/api/regime' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('GET /api/regime/:asset', () => {
    it('returns regime and features for a valid asset', async () => {
      mockGetState.mockImplementation(async (_redis, key) => {
        if (key === 'state:regime:BTC') return mockRegimeBTC;
        if (key === 'state:features:BTC') return mockFeaturesBTC;
        return null;
      });

      const response = await app.inject({ method: 'GET', url: '/api/regime/BTC' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.asset).toBe('BTC');
      expect(body.data.label).toBe('bull');
      expect(body.data.features).toEqual(mockFeaturesBTC);
    });

    it('returns 400 for an invalid asset', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/regime/INVALID' });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid asset');
    });

    it('returns 404 when no regime data exists for asset', async () => {
      mockGetState.mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/api/regime/ETH' });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('No data for asset');
    });

    it('handles lowercase asset param by uppercasing', async () => {
      mockGetState.mockImplementation(async (_redis, key) => {
        if (key === 'state:regime:BTC') return mockRegimeBTC;
        if (key === 'state:features:BTC') return mockFeaturesBTC;
        return null;
      });

      const response = await app.inject({ method: 'GET', url: '/api/regime/btc' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.asset).toBe('BTC');
    });
  });

  describe('GET /api/features/:asset', () => {
    it('returns features for a valid asset', async () => {
      mockGetState.mockImplementation(async (_redis, key) => {
        if (key === 'state:features:BTC') return mockFeaturesBTC;
        return null;
      });

      const response = await app.inject({ method: 'GET', url: '/api/features/BTC' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toEqual(mockFeaturesBTC);
    });

    it('returns 400 for an invalid asset', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/features/DOGE' });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid asset');
    });

    it('returns 404 when no features exist for asset', async () => {
      mockGetState.mockResolvedValue(null);

      const response = await app.inject({ method: 'GET', url: '/api/features/SOL' });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('No features for asset');
    });
  });

  describe('GET /api/history/:asset', () => {
    it('returns history data for a valid asset', async () => {
      const mockHistory = [
        { ts: 1000000, score: 0.5, label: 'bull' as const },
        { ts: 1060000, score: 0.3, label: 'neutral' as const },
      ];
      mockQueryHistory.mockResolvedValue(mockHistory);

      const response = await app.inject({
        method: 'GET',
        url: '/api/history/BTC?from=1000000&to=2000000&interval=1m',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.asset).toBe('BTC');
      expect(body.data.interval).toBe('1m');
      expect(body.data.data).toEqual(mockHistory);
    });

    it('returns history with default time range when no from/to provided', async () => {
      const mockHistory = [{ ts: 1000000, score: 0.4, label: 'neutral' as const }];
      mockQueryHistory.mockResolvedValue(mockHistory);

      const response = await app.inject({ method: 'GET', url: '/api/history/ETH' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data.asset).toBe('ETH');
      expect(body.data.data).toEqual(mockHistory);
      expect(mockQueryHistory).toHaveBeenCalledWith(
        mockClickhouse,
        'ETH',
        expect.any(Number),
        expect.any(Number),
        '1m',
      );
    });

    it('returns 400 for an invalid asset', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/history/INVALID' });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid asset');
    });

    it('returns 400 for an invalid interval', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/history/BTC?interval=badinterval',
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid query params');
    });
  });
});
