export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  host: process.env.HOST ?? '0.0.0.0',

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  clickhouse: {
    url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
    database: process.env.CLICKHOUSE_DB ?? 'bullbear',
  },

  exchanges: {
    enabled: (process.env.EXCHANGES ?? 'binance,bybit,okx').split(',') as Array<'binance' | 'bybit' | 'okx'>,
  },
} as const;
