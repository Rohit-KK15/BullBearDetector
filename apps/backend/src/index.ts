import { config } from './config.js';
import { createRedisClient } from './storage/redis.js';
import { createClickHouseClient } from './storage/clickhouse.js';
import { startIngestion } from './ingestion/index.js';
import { startFeatureEngine } from './features/index.js';
import { startRegimeEngine } from './regime/index.js';
import { createServer } from './api/index.js';
import { setupWebSocket } from './api/ws.js';

async function main() {
  const redis = createRedisClient(config.redis.url);
  const clickhouse = createClickHouseClient(config.clickhouse);

  // Start pipeline modules
  await startIngestion(redis, config);
  await startFeatureEngine(redis);
  await startRegimeEngine(redis, clickhouse);

  // Start API server
  const app = await createServer(redis, clickhouse);
  await setupWebSocket(app, redis);
  await app.listen({ port: config.port, host: config.host });

  console.log(`BullBearDetector running on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
