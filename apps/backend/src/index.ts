import { config } from './config.js';
import { createRedisClient } from './storage/redis.js';
import { createClickHouseClient } from './storage/clickhouse.js';
import { startIngestion } from './ingestion/index.js';
import { startFeatureEngine } from './features/index.js';
import { startRegimeEngine } from './regime/index.js';
import { createServer } from './api/index.js';
import { setupWebSocket } from './api/ws.js';

async function main() {
  // Separate Redis clients to prevent XREADGROUP BLOCK from stalling API reads.
  // Each blocking consumer loop needs its own connection; API/WS reads share a non-blocking one.
  const redisIngestion = createRedisClient(config.redis.url);
  const redisFeatures = createRedisClient(config.redis.url);
  const redisRegime = createRedisClient(config.redis.url);
  const redisApi = createRedisClient(config.redis.url);
  const redisWs = createRedisClient(config.redis.url);

  const clickhouse = createClickHouseClient(config.clickhouse);

  // Start pipeline modules (each with its own blocking Redis connection)
  await startIngestion(redisIngestion, config);
  await startFeatureEngine(redisFeatures);
  await startRegimeEngine(redisRegime, clickhouse);

  // Start API server (non-blocking Redis connection)
  const app = await createServer(redisApi, clickhouse);
  await setupWebSocket(app, redisWs);
  await app.listen({ port: config.port, host: config.host });

  console.log(`BullBearDetector running on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
