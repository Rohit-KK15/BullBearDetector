import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Redis } from 'ioredis';
import type { ClickHouseClient } from '@clickhouse/client';
import { registerRoutes } from './routes.js';

export async function createServer(redis: Redis, clickhouse: ClickHouseClient) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  registerRoutes(app, redis, clickhouse);
  return app;
}
