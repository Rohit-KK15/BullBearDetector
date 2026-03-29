import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { ClickHouseClient } from '@clickhouse/client';
import { ASSETS, AssetParam, HistoryQuery, REDIS_STATE_KEYS, type Asset } from '@bull-bear/shared';
import { getState } from '../storage/redis.js';
import { queryHistory, queryRegimeTransitions, queryPriceHistory } from '../storage/clickhouse.js';

export function registerRoutes(app: FastifyInstance, redis: Redis, clickhouse: ClickHouseClient) {
  // GET /api/regime — all assets
  app.get('/api/regime', async (_req, _reply) => {
    const results = [];
    for (const asset of ASSETS) {
      const state = await getState(redis, REDIS_STATE_KEYS.regime(asset));
      if (state) results.push(state);
    }
    return { data: results };
  });

  // GET /api/regime/:asset — single asset with features
  app.get('/api/regime/:asset', async (req, reply) => {
    const { asset } = req.params as { asset: string };
    const parsed = AssetParam.safeParse(asset.toUpperCase());
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid asset' });

    const regime = await getState(redis, REDIS_STATE_KEYS.regime(parsed.data as Asset));
    const features = await getState(redis, REDIS_STATE_KEYS.features(parsed.data as Asset));
    if (!regime) return reply.status(404).send({ error: 'No data for asset' });

    return { data: { ...regime, features } };
  });

  // GET /api/features/:asset
  app.get('/api/features/:asset', async (req, reply) => {
    const { asset } = req.params as { asset: string };
    const parsed = AssetParam.safeParse(asset.toUpperCase());
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid asset' });

    const features = await getState(redis, REDIS_STATE_KEYS.features(parsed.data as Asset));
    if (!features) return reply.status(404).send({ error: 'No features for asset' });

    return { data: features };
  });

  // GET /api/history/:asset
  app.get('/api/history/:asset', async (req, reply) => {
    const { asset } = req.params as { asset: string };
    const parsed = AssetParam.safeParse(asset.toUpperCase());
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid asset' });

    const query = HistoryQuery.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' });

    const { from, to, interval } = query.data;
    const now = Date.now();
    const data = await queryHistory(
      clickhouse,
      parsed.data as Asset,
      from ?? now - 3600_000,
      to ?? now,
      interval,
    );

    return { data: { asset: parsed.data, interval, data } };
  });

  // GET /api/transitions/:asset — regime change history
  app.get('/api/transitions/:asset', async (req, reply) => {
    const { asset } = req.params as { asset: string };
    const parsed = AssetParam.safeParse(asset.toUpperCase());
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid asset' });

    const { hours } = req.query as { hours?: string };
    const data = await queryRegimeTransitions(
      clickhouse,
      parsed.data as Asset,
      hours ? parseInt(hours, 10) : 24,
    );

    return { data };
  });

  // GET /api/prices/:asset — OHLC price history
  app.get('/api/prices/:asset', async (req, reply) => {
    const { asset } = req.params as { asset: string };
    const parsed = AssetParam.safeParse(asset.toUpperCase());
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid asset' });

    const query = HistoryQuery.safeParse(req.query);
    if (!query.success) return reply.status(400).send({ error: 'Invalid query params' });

    const { from, to, interval } = query.data;
    const now = Date.now();
    const data = await queryPriceHistory(
      clickhouse,
      parsed.data as Asset,
      from ?? now - 3600_000,
      to ?? now,
      interval,
    );

    return { data: { asset: parsed.data, interval, data } };
  });
}
