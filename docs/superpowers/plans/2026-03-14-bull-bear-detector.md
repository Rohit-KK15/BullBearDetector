# BullBearDetector Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time crypto market regime detection platform that streams exchange data, computes microstructure signals (momentum, order flow, depth, funding, volatility), produces bull/bear/neutral scores for BTC/ETH/SOL every 5 seconds, and displays them on a web dashboard.

**Architecture:** Pipeline monolith backend — single Node.js process with modular internals (ingestion → features → regime → storage → API) communicating via Redis Streams. Next.js frontend on Vercel consumes the Fastify REST + WebSocket API.

**Tech Stack:** TypeScript, Turborepo/pnpm monorepo, Fastify, ws, CCXT Pro, ioredis, @clickhouse/client, Next.js App Router, TailwindCSS, TradingView Lightweight Charts, TanStack Query, Docker

**Spec:** `docs/superpowers/specs/2026-03-14-bull-bear-detector-design.md`

---

## Chunk 1: Monorepo Scaffold, Shared Types, Docker Infrastructure

### Task 1: Initialize Turborepo Monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Initialize pnpm workspace**

```bash
cd /Users/rohitkk/Personal\ Projects/BullBearDetector
pnpm init
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "lint": {}
  }
}
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Update .gitignore**

Append:
```
node_modules/
dist/
.env
.env.local
.turbo/
```

- [ ] **Step 6: Install root devDependencies**

```bash
pnpm add -Dw turbo typescript @types/node
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: initialize turborepo monorepo scaffold"
```

---

### Task 2: Create Shared Package (Types, Constants, Schemas)

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create package.json for shared**

```json
{
  "name": "@bull-bear/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write types.ts**

```typescript
// ---- Assets ----
export type Asset = 'BTC' | 'ETH' | 'SOL';
export type Exchange = 'binance' | 'bybit' | 'okx';
export type RegimeLabel = 'bull' | 'neutral' | 'bear';
export type TakerSide = 'buy' | 'sell';

// ---- Raw market data (ingestion → Redis Streams) ----
export interface Trade {
  asset: Asset;
  exchange: Exchange;
  price: number;
  qty: number;
  side: TakerSide;
  ts: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthSnapshot {
  asset: Asset;
  exchange: Exchange;
  bids: DepthLevel[];  // top 10, best first
  asks: DepthLevel[];  // top 10, best first
  ts: number;
}

export interface FundingUpdate {
  asset: Asset;
  exchange: Exchange;
  rate: number;
  markPrice: number;
  ts: number;
}

// ---- Computed features (feature engine → Redis Streams) ----
// Note: spec stream payload uses "volatility" as shorthand for "volatilityPercentile".
// We use volatilityPercentile as the canonical name to be explicit.
export interface FeatureSnapshot {
  asset: Asset;
  // directional signals [-1, +1]
  momentum: number;
  ofi: number;
  depthImb: number;
  fundingSentiment: number;
  // conviction raw inputs
  volatilityPercentile: number;  // [0, 1] — percentile rank of realized vol
  volumeRatio: number;           // raw ratio vs EMA
  // conviction computed factors [0, 1]
  volConfidence: number;
  volumeConfidence: number;
  // composites
  direction: number;   // [-1, +1]
  conviction: number;  // [0, 1]
  ts: number;
}

// ---- Direction breakdown (weighted contributions) ----
export interface DirectionComponents {
  momentum: number;
  flow: number;
  depth: number;
  funding: number;
}

// ---- Conviction breakdown ----
export interface ConvictionFactors {
  volConfidence: number;
  volumeConfidence: number;
  signalAgreement: number;
}

// ---- Regime score (regime engine → Redis + ClickHouse) ----
export interface RegimeScore {
  asset: Asset;
  score: number;       // [-1, +1]
  label: RegimeLabel;
  direction: DirectionComponents;
  conviction: ConvictionFactors;
  ts: number;
}

// ---- API response types ----
export interface RegimeWithFeatures extends RegimeScore {
  features: FeatureSnapshot;
}

export interface HistoryPoint {
  ts: number;
  score: number;
  label: RegimeLabel;
}

export interface HistoryResponse {
  asset: Asset;
  interval: string;
  data: HistoryPoint[];
}

// ---- WebSocket messages ----
export interface WsSubscribeMessage {
  action: 'subscribe';
  assets: Asset[];
}

export interface WsRegimeUpdate {
  type: 'regime';
  asset: Asset;
  score: number;
  label: RegimeLabel;
  direction: DirectionComponents;
  conviction: ConvictionFactors;
  ts: number;
}

export type WsClientMessage = WsSubscribeMessage;
export type WsServerMessage = WsRegimeUpdate;
```

- [ ] **Step 4: Write constants.ts**

```typescript
import type { Asset, Exchange } from './types.js';

export const ASSETS: Asset[] = ['BTC', 'ETH', 'SOL'];

export const EXCHANGES: Exchange[] = ['binance', 'bybit', 'okx'];

export const SYMBOLS: Record<Asset, string> = {
  BTC: 'BTC/USDT:USDT',
  ETH: 'ETH/USDT:USDT',
  SOL: 'SOL/USDT:USDT',
};

// ---- Regime scoring ----
export const DIRECTION_WEIGHTS = {
  momentum: 0.35,
  orderFlow: 0.30,
  depth: 0.20,
  funding: 0.15,
} as const;

export const REGIME_THRESHOLDS = {
  bull: 0.3,
  bear: -0.3,
} as const;

export const SCORE_SCALING_FACTOR = 1.5;

// ---- Signal parameters ----
export const MOMENTUM_WEIGHTS = {
  r1m: 0.5,
  r5m: 0.3,
  r15m: 0.2,
} as const;

export const ZSCORE_WINDOW = 60;
export const ZSCORE_CLAMP = 3;

export const FUNDING_SCALING_FACTOR = 0.0003;

export const DEPTH_LEVELS = 10;

// ---- Conviction parameters ----
export const VOL_CONFIDENCE = {
  deadThreshold: 0.2,
  chaoticThreshold: 0.8,
  deadValue: 0.5,
  normalValue: 1.0,
  chaoticValue: 0.6,
} as const;

export const VOLUME_CONFIDENCE = {
  floor: 0.3,
  ceiling: 1.0,
  maxRatio: 2.0,
} as const;

export const SIGNAL_AGREEMENT = {
  floor: 0.5,
  range: 0.5,
} as const;

// ---- Timing ----
export const TICK_INTERVAL_MS = 5_000;
export const OFI_WINDOW_MS = 60_000;      // 1 min
export const VOL_SAMPLES = 60;             // 5-min at 5s ticks
export const VOL_PERCENTILE_WINDOW = 720;  // 1-hour at 5s ticks
export const VOLUME_EMA_PERIODS = 30;      // 30 x 1-min buckets

// ---- Redis stream keys ----
export const STREAM_KEYS = {
  trades: (asset: Asset) => `trades:${asset}`,
  depth: (asset: Asset) => `depth:${asset}`,
  funding: (asset: Asset) => `funding:${asset}`,
  features: (asset: Asset) => `features:${asset}`,
  regime: (asset: Asset) => `regime:${asset}`,
} as const;

export const REDIS_STATE_KEYS = {
  regime: (asset: Asset) => `state:regime:${asset}`,
  features: (asset: Asset) => `state:features:${asset}`,
} as const;

export const STREAM_MAXLEN = 10_000;

// ---- ClickHouse ----
export const VALID_INTERVALS = ['5s', '1m', '5m', '15m', '1h', '1d'] as const;
export type Interval = (typeof VALID_INTERVALS)[number];
```

- [ ] **Step 5: Write schemas.ts**

```typescript
import { z } from 'zod';
import { ASSETS, VALID_INTERVALS } from './constants.js';

export const AssetParam = z.enum(ASSETS as unknown as [string, ...string[]]);

export const HistoryQuery = z.object({
  from: z.coerce.number().optional(),
  to: z.coerce.number().optional(),
  interval: z.enum(VALID_INTERVALS).default('1m'),
});

export const WsSubscribeSchema = z.object({
  action: z.literal('subscribe'),
  assets: z.array(AssetParam),
});
```

- [ ] **Step 6: Write index.ts barrel export**

```typescript
export * from './types.js';
export * from './constants.js';
export * from './schemas.js';
```

- [ ] **Step 7: Install deps and commit**

```bash
cd packages/shared && pnpm install
cd ../.. && git add -A && git commit -m "feat: add shared package with types, constants, schemas"
```

---

### Task 3: Docker Infrastructure (Redis + ClickHouse)

**Files:**
- Create: `docker/docker-compose.yml`
- Create: `docker/clickhouse/init.sql`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  clickhouse:
    image: clickhouse/clickhouse-server:24-alpine
    ports:
      - "8123:8123"   # HTTP
      - "9000:9000"   # native
    volumes:
      - clickhouse-data:/var/lib/clickhouse
      - ./clickhouse/init.sql:/docker-entrypoint-initdb.d/init.sql
    environment:
      CLICKHOUSE_DB: bullbear
      CLICKHOUSE_USER: default
      CLICKHOUSE_PASSWORD: ""

volumes:
  redis-data:
  clickhouse-data:
```

- [ ] **Step 2: Create ClickHouse init script**

```sql
CREATE DATABASE IF NOT EXISTS bullbear;

CREATE TABLE IF NOT EXISTS bullbear.features (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    momentum              Float64,
    order_flow_imbalance  Float64,
    depth_imbalance       Float64,
    funding_sentiment     Float64,
    volatility_percentile Float64,
    volume_ratio          Float64,
    direction             Float64,
    conviction            Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE IF NOT EXISTS bullbear.regime_scores (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    score                 Float64,
    label                 LowCardinality(String),
    momentum_component    Float64,
    flow_component        Float64,
    depth_component       Float64,
    funding_component     Float64,
    direction             Float64,
    conviction            Float64,
    vol_confidence        Float64,
    volume_confidence     Float64,
    signal_agreement      Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;
```

- [ ] **Step 3: Test docker-compose up**

```bash
cd docker && docker-compose up -d
# Verify Redis
docker-compose exec redis redis-cli ping  # expect PONG
# Verify ClickHouse
curl 'http://localhost:8123/?query=SHOW+TABLES+FROM+bullbear'  # expect features\nregime_scores
docker-compose down
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add docker-compose with Redis and ClickHouse"
```

---

### Task 4: Initialize Backend App

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/tsconfig.json`
- Create: `apps/backend/src/index.ts`
- Create: `apps/backend/src/config.ts`

- [ ] **Step 1: Create backend package.json**

```json
{
  "name": "@bull-bear/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@bull-bear/shared": "workspace:*",
    "fastify": "^5.1.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/websocket": "^11.0.0",
    "ioredis": "^5.4.0",
    "@clickhouse/client": "^1.8.0",
    "ccxt": "^4.4.0",
    "zod": "^3.23.0",
    "pino": "^9.5.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "tsx": "^4.19.0",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write config.ts**

```typescript
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
```

- [ ] **Step 4: Write minimal index.ts bootstrap**

```typescript
import { config } from './config.js';

async function main() {
  console.log('BullBearDetector backend starting...', { port: config.port });
  // Modules will be wired up in subsequent tasks
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Install deps, verify it runs**

```bash
pnpm install
cd apps/backend && pnpm dev  # should print "BullBearDetector backend starting..."
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: initialize backend app with config"
```

---

## Chunk 2: Storage Layer + Ingestion Module

### Task 5: Redis Client + State Store

**Files:**
- Create: `apps/backend/src/storage/redis.ts`
- Create: `apps/backend/src/storage/index.ts`

- [ ] **Step 1: Write redis.ts**

Redis client wrapper with:
- `createRedisClient(url)` — returns ioredis instance
- `publishToStream(redis, streamKey, data, maxlen)` — `XADD` with `MAXLEN ~`
- `getState(redis, key)` — `GET` and JSON.parse
- `setState(redis, key, data)` — `SET` with JSON.stringify
- Consumer group helpers: `createConsumerGroup`, `readFromStream`, `ackMessage`

- [ ] **Step 2: Write test for publishToStream and getState/setState**

Test with a real Redis instance (docker-compose must be up):
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// test publish, read back, state set/get
```

- [ ] **Step 3: Run tests, verify pass**

```bash
cd apps/backend && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Redis client wrapper with stream and state helpers"
```

---

### Task 6: ClickHouse Client

**Files:**
- Create: `apps/backend/src/storage/clickhouse.ts`

- [ ] **Step 1: Write clickhouse.ts**

ClickHouse client wrapper with:
- `createClickHouseClient(config)` — returns @clickhouse/client instance
- `insertFeatures(client, rows: FeatureSnapshot[])` — batch insert into `features` table
- `insertRegimeScores(client, rows: RegimeScore[])` — batch insert into `regime_scores` table
- `queryHistory(client, asset, from, to, interval)` — aggregated history query with `avg(score)`, re-derive label from thresholds
- Column name mapping: camelCase TypeScript → snake_case ClickHouse

- [ ] **Step 2: Write test for insert + query roundtrip**

Test with real ClickHouse (docker-compose up):
```typescript
// Insert a feature snapshot, query it back, verify values
// Insert regime scores, query history with 5s interval, verify
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add ClickHouse client with insert and history query"
```

---

### Task 7: Ingestion Module — CCXT Exchange Connections

**Files:**
- Create: `apps/backend/src/ingestion/exchange-client.ts`
- Create: `apps/backend/src/ingestion/normalizer.ts`
- Create: `apps/backend/src/ingestion/ingestion-service.ts`
- Create: `apps/backend/src/ingestion/index.ts`

- [ ] **Step 1: Write exchange-client.ts**

Factory that creates CCXT Pro exchange instances:
- `createExchangeClient(exchangeId)` — returns ccxt.pro exchange instance
- Subscribes to: `watchTrades`, `watchOrderBook`, `watchMarkPrice` (per symbol)
- Funding rate: polled via `fetchFundingRate` on interval (CCXT doesn't stream this for all exchanges)

- [ ] **Step 2: Write normalizer.ts**

Converts raw CCXT data to our shared types:
- `normalizeTrade(ccxtTrade, asset, exchange) → Trade`
- `normalizeOrderBook(ccxtOrderBook, asset, exchange) → DepthSnapshot` (top 10 levels)
- `normalizeFunding(ccxtFunding, asset, exchange) → FundingUpdate`

- [ ] **Step 3: Write test for normalizer**

```typescript
// Mock CCXT trade object → verify Trade output
// Mock CCXT orderbook → verify DepthSnapshot with exactly 10 levels
// Mock CCXT funding → verify FundingUpdate
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Write ingestion-service.ts**

The main ingestion orchestrator:
- `startIngestion(redis, config)` — for each exchange × asset:
  - Connect WebSocket
  - On trade → normalize → `publishToStream(redis, trades:{asset}, trade)`
  - On orderbook → normalize → `publishToStream(redis, depth:{asset}, snapshot)`
  - On funding → normalize → `publishToStream(redis, funding:{asset}, update)`
  - Mark price extracted from funding update → stored in Redis state key
- Handles reconnection (CCXT Pro handles this internally)
- Logs connection status per exchange

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add ingestion module with CCXT exchange connections"
```

---

## Chunk 3: Feature Engine + Regime Engine

### Task 8: Math Utilities

**Files:**
- Create: `apps/backend/src/features/math.ts`
- Create: `apps/backend/src/features/math.test.ts`

- [ ] **Step 1: Write math.ts**

Pure functions, no side effects:
- `rollingZScore(values: number[], window: number): number` — z-score of latest value against rolling window
- `clampedZScore(value: number, mean: number, stddev: number): number` — clamp [-3,3] / 3
- `ema(prev: number, value: number, periods: number): number` — exponential moving average step
- `rollingPercentileRank(value: number, history: number[]): number` — what fraction of history is ≤ value
- `stddev(values: number[]): number` — population standard deviation
- `safeRatio(a: number, b: number): number` — (a - b) / (a + b), returns 0 if denominator is 0

- [ ] **Step 2: Write comprehensive tests**

```typescript
describe('rollingZScore', () => {
  it('returns 0 for constant values', ...);
  it('returns positive for above-mean value', ...);
  it('handles window shorter than data', ...);
});

describe('clampedZScore', () => {
  it('clamps extreme positive to 1', ...);
  it('clamps extreme negative to -1', ...);
  it('returns 0 when stddev is 0', ...);
});

describe('ema', () => {
  it('first value equals the value itself', ...);
  it('converges toward repeated value', ...);
});

describe('rollingPercentileRank', () => {
  it('returns 1.0 for max value', ...);
  it('returns ~0.5 for median', ...);
});

describe('safeRatio', () => {
  it('returns 0 when both zero', ...);
  it('returns 1 when b is 0', ...);
  it('returns -1 when a is 0', ...);
  it('computes correctly for normal values', ...);
});
```

- [ ] **Step 3: Run tests, verify all pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add math utilities with tests"
```

---

### Task 9: Feature Engine — Signal Accumulators

**Files:**
- Create: `apps/backend/src/features/accumulators.ts`
- Create: `apps/backend/src/features/accumulators.test.ts`

- [ ] **Step 1: Write accumulators.ts**

Stateful classes that accumulate raw data and emit signal values on demand:

```typescript
export class MomentumAccumulator {
  // Maintains rolling buffer of mark price snapshots (every 5s)
  // On compute(): returns momentum [-1, +1] using multi-timeframe z-scores
  //
  // Cold start weight redistribution:
  //   availableTerms = filter({r1m: 0.5, r5m: 0.3, r15m: 0.2} to terms with enough samples)
  //   scale = 1 / sum(availableTerms.values())
  //   momentum = sum(r_Xm * weight * scale for each available term)
  //
  // Example: only r_1m available (first 60s) → momentum = r_1m * 0.5 * (1/0.5) = r_1m * 1.0
  // After 5min: r_1m + r_5m available → scale = 1/0.8 → weights become 0.625 and 0.375
  // After 15min: all terms available → normal weights (0.5, 0.3, 0.2)
}

export class OrderFlowAccumulator {
  // Maintains 1-min rolling window of dollar-weighted trades
  // addTrade(trade: Trade): void
  // compute(): returns ofi [-1, +1]
}

export class DepthAccumulator {
  // Holds latest depth snapshot per exchange
  // updateDepth(snapshot: DepthSnapshot): void
  // compute(): returns depthImb [-1, +1] (distance-weighted, aggregated across exchanges)
}

export class FundingAccumulator {
  // Holds latest funding rate per exchange
  // updateFunding(update: FundingUpdate): void
  // compute(): returns fundingSentiment [-1, +1]
}

export class VolatilityAccumulator {
  // Maintains rolling buffer of 5s log returns (60 samples)
  // Plus 1-hour history of realized vol values for percentile rank
  // addReturn(logReturn: number): void
  // compute(): returns { realizedVol, volPercentile, volConfidence }
}

export class VolumeAccumulator {
  // Maintains 1-min dollar volume buckets + 30-min EMA
  // addTrade(trade: Trade): void
  // compute(): returns { volumeRatio, volumeConfidence }
}
```

- [ ] **Step 2: Write tests for each accumulator**

Test each accumulator independently with synthetic data:
- MomentumAccumulator: feed rising prices → positive momentum, flat → ~0, cold start with few samples
- OrderFlowAccumulator: all buys → ofi near 1.0, mixed → near 0, empty window → 0
- DepthAccumulator: heavy bids → positive, balanced → ~0, empty book → 0
- FundingAccumulator: positive rate → positive sentiment, zero → 0
- VolatilityAccumulator: constant prices → low vol/percentile, volatile → high
- VolumeAccumulator: 2x average → confidence near 1.0, cold start → 0.65

- [ ] **Step 3: Run tests, verify all pass**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add signal accumulators with tests"
```

---

### Task 10: Feature Engine Service

**Files:**
- Create: `apps/backend/src/features/feature-engine.ts`
- Create: `apps/backend/src/features/index.ts`

- [ ] **Step 1: Write feature-engine.ts**

The orchestrator that:
- Consumes from Redis streams: `trades:{asset}`, `depth:{asset}`, `funding:{asset}`
- Routes data to the appropriate accumulators per asset
- Every 5 seconds (TICK_INTERVAL_MS), for each asset:
  - Calls `.compute()` on all accumulators
  - Computes `direction` (weighted sum of directional signals)
  - Computes `conviction` (product of conviction factors)
  - Publishes `FeatureSnapshot` to `features:{asset}` stream
  - Stores latest features in Redis state key

```typescript
export function startFeatureEngine(redis: Redis): void {
  // Create accumulators per asset
  const accumulators = new Map<Asset, AssetAccumulators>();
  for (const asset of ASSETS) {
    accumulators.set(asset, createAccumulators());
  }

  // Consume raw streams (non-blocking poll loop)
  consumeStreams(redis, accumulators);

  // Emit features every 5s
  setInterval(() => {
    for (const asset of ASSETS) {
      const acc = accumulators.get(asset)!;
      const snapshot = computeFeatureSnapshot(asset, acc);
      publishToStream(redis, STREAM_KEYS.features(asset), snapshot);
      setState(redis, REDIS_STATE_KEYS.features(asset), snapshot);
    }
  }, TICK_INTERVAL_MS);
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add feature engine service"
```

---

### Task 11: Regime Engine

**Files:**
- Create: `apps/backend/src/regime/regime-engine.ts`
- Create: `apps/backend/src/regime/score.ts`
- Create: `apps/backend/src/regime/score.test.ts`
- Create: `apps/backend/src/regime/index.ts`

- [ ] **Step 1: Write score.ts — pure scoring function**

```typescript
import {
  DIRECTION_WEIGHTS, SCORE_SCALING_FACTOR, REGIME_THRESHOLDS,
  type RegimeLabel, type FeatureSnapshot, type RegimeScore,
  type DirectionComponents, type ConvictionFactors,
} from '@bull-bear/shared';

export function computeRegimeScore(features: FeatureSnapshot): RegimeScore {
  const dirComponents: DirectionComponents = {
    momentum: DIRECTION_WEIGHTS.momentum * features.momentum,
    flow: DIRECTION_WEIGHTS.orderFlow * features.ofi,
    depth: DIRECTION_WEIGHTS.depth * features.depthImb,
    funding: DIRECTION_WEIGHTS.funding * features.fundingSentiment,
  };

  const direction = dirComponents.momentum + dirComponents.flow
    + dirComponents.depth + dirComponents.funding;

  // Signal agreement
  const signs = [
    Math.sign(features.momentum),
    Math.sign(features.ofi),
    Math.sign(features.depthImb),
  ];
  const agreementRatio = Math.abs(signs[0] + signs[1] + signs[2]) / 3;
  const signalAgreement = 0.5 + 0.5 * agreementRatio;

  // Conviction factors are pre-computed by the feature engine
  const { volConfidence, volumeConfidence } = features;

  const convictionFactors: ConvictionFactors = {
    volConfidence,
    volumeConfidence,
    signalAgreement,
  };

  const conviction = volConfidence * volumeConfidence * signalAgreement;
  const rawScore = direction * conviction * SCORE_SCALING_FACTOR;
  const score = Math.max(-1, Math.min(1, rawScore));

  const label: RegimeLabel =
    score > REGIME_THRESHOLDS.bull ? 'bull' :
    score < REGIME_THRESHOLDS.bear ? 'bear' : 'neutral';

  return {
    asset: features.asset,
    score,
    label,
    direction: dirComponents,
    conviction: convictionFactors,
    ts: features.ts,
  };
}
```

- [ ] **Step 2: Write comprehensive score tests**

```typescript
describe('computeRegimeScore', () => {
  it('strong bull: all signals positive + high conviction → score > 0.5', ...);
  it('strong bear: all signals negative + high conviction → score < -0.5', ...);
  it('neutral: mixed signals → score near 0', ...);
  it('low conviction dampens strong direction', ...);
  it('signal disagreement reduces score', ...);
  it('score is clamped to [-1, 1]', ...);
  it('classification thresholds: >0.3 bull, <-0.3 bear, else neutral', ...);
  it('reproduces the spec walkthrough: bull scenario → 0.78', () => {
    // Use exact values from the spec walkthrough
    const features: FeatureSnapshot = {
      asset: 'BTC',
      momentum: 0.56,
      ofi: 0.45,
      depthImb: 0.40,
      fundingSentiment: 1.00,
      volatilityPercentile: 0.45,
      volumeRatio: 1.8,
      direction: 0, // will be computed
      conviction: 0, // will be computed
      ts: Date.now(),
    };
    const result = computeRegimeScore(features);
    expect(result.score).toBeCloseTo(0.78, 1);
    expect(result.label).toBe('bull');
  });
  it('reproduces the spec walkthrough: neutral scenario → 0.037', ...);
});
```

- [ ] **Step 3: Run tests, verify all pass**

- [ ] **Step 4: Write regime-engine.ts — the consumer service**

Redis Streams require flat key-value entries. `RegimeScore` has nested `direction` and `conviction` objects. Use explicit flatten/unflatten helpers:

```typescript
// Flatten RegimeScore for XADD (flat scalars only)
function flattenRegimeScore(r: RegimeScore): Record<string, string> {
  return {
    asset: r.asset,
    score: String(r.score),
    label: r.label,
    direction: String(r.direction.momentum + r.direction.flow + r.direction.depth + r.direction.funding),
    conviction: String(r.conviction.volConfidence * r.conviction.volumeConfidence * r.conviction.signalAgreement),
    momentumComp: String(r.direction.momentum),
    flowComp: String(r.direction.flow),
    depthComp: String(r.direction.depth),
    fundingComp: String(r.direction.funding),
    volConf: String(r.conviction.volConfidence),
    volumeConf: String(r.conviction.volumeConfidence),
    sigAgree: String(r.conviction.signalAgreement),
    ts: String(r.ts),
  };
}

export function startRegimeEngine(redis: Redis, clickhouse: ClickHouseClient): void {
  // Consume features:{asset} streams
  // For each feature snapshot:
  //   1. computeRegimeScore(features)
  //   2. publishToStream(redis, regime:{asset}, flattenRegimeScore(regimeScore))
  //   3. setState(redis, state:regime:{asset}, regimeScore)  // nested JSON, for API reads
  //   4. Batch insert to ClickHouse (features + regime_scores tables)
}
```

Note: `publishToStream` uses the flattened version (flat key-value for Redis XADD). `setState` stores the full nested `RegimeScore` as JSON — the API reads this directly without needing to reconstruct.

The spec's regime stream payload has a typo (`volConf` listed twice). The correct flat keys are: `volConf` (volatility confidence) and `volumeConf` (volume confidence).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add regime engine with scoring function and tests"
```

---

## Chunk 4: API Server + WebSocket

### Task 12: Fastify REST API

**Files:**
- Create: `apps/backend/src/api/server.ts`
- Create: `apps/backend/src/api/routes.ts`
- Create: `apps/backend/src/api/index.ts`

- [ ] **Step 1: Write server.ts — Fastify setup**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerRoutes } from './routes.js';

export async function createServer(redis: Redis, clickhouse: ClickHouseClient) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  registerRoutes(app, redis, clickhouse);
  return app;
}
```

- [ ] **Step 2: Write routes.ts**

Four routes:
- `GET /api/regime` — read all assets' latest state from Redis, return array
- `GET /api/regime/:asset` — read single asset state + features from Redis
- `GET /api/features/:asset` — read latest features from Redis
- `GET /api/history/:asset` — query ClickHouse with `HistoryQuery` validation

Each route:
- Validates params/query with Zod schemas from `@bull-bear/shared`
- Reads from Redis state keys (for live data) or ClickHouse (for history)
- Returns JSON matching the spec response schemas

- [ ] **Step 3: Write route tests**

Use `app.inject()` for testing (Fastify's built-in test helper):
```typescript
// Seed Redis with test regime scores
// GET /api/regime → verify response shape and data
// GET /api/regime/BTC → verify includes features
// GET /api/history/BTC?interval=5s → verify ClickHouse query
// GET /api/regime/INVALID → verify 400
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Fastify REST API routes"
```

---

### Task 13: WebSocket Server

**Files:**
- Create: `apps/backend/src/api/ws.ts`

- [ ] **Step 1: Write ws.ts**

Uses `@fastify/websocket` (not raw `ws` directly — it wraps `ws` and integrates with Fastify routing). Remove raw `ws` from package.json deps (only `@fastify/websocket` needed; it bundles `ws`). Keep `@types/ws` for type definitions.

```typescript
import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import { WsSubscribeSchema, type Asset, type WsRegimeUpdate, ASSETS, REDIS_STATE_KEYS } from '@bull-bear/shared';

interface Client {
  socket: WebSocket;
  assets: Set<Asset>;
}

export async function setupWebSocket(app: FastifyInstance, redis: Redis) {
  await app.register(import('@fastify/websocket'));

  const clients = new Set<Client>();

  // Poll regime state every 5s and broadcast to subscribed clients
  setInterval(async () => {
    for (const asset of ASSETS) {
      const data = await redis.get(REDIS_STATE_KEYS.regime(asset));
      if (!data) continue;
      const msg = JSON.stringify({ type: 'regime', ...JSON.parse(data) });
      for (const client of clients) {
        if (client.assets.has(asset) && client.socket.readyState === 1) {
          client.socket.send(msg);
        }
      }
    }
  }, 5000);

  app.get('/ws/stream', { websocket: true }, (socket, req) => {
    const client: Client = { socket, assets: new Set() };
    clients.add(client);

    socket.on('message', (raw) => {
      try {
        const msg = WsSubscribeSchema.parse(JSON.parse(String(raw)));
        client.assets = new Set(msg.assets as Asset[]);
      } catch { /* ignore invalid messages */ }
    });

    socket.on('close', () => clients.delete(client));
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add WebSocket server for real-time regime updates"
```

---

### Task 14: Wire Up Backend Bootstrap

**Files:**
- Modify: `apps/backend/src/index.ts`

- [ ] **Step 1: Update index.ts to wire all modules**

```typescript
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
  startIngestion(redis, config);
  startFeatureEngine(redis);
  startRegimeEngine(redis, clickhouse);

  // Start API server
  const app = await createServer(redis, clickhouse);
  setupWebSocket(app, redis);
  await app.listen({ port: config.port, host: config.host });

  console.log(`BullBearDetector running on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Integration test — start with docker-compose, verify end-to-end**

```bash
cd docker && docker-compose up -d
cd .. && cd apps/backend && pnpm dev
# In another terminal:
curl http://localhost:3001/api/regime   # should return { data: [] } or scores
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: wire up backend bootstrap with all modules"
```

---

## Chunk 5: Next.js Frontend

### Task 15: Initialize Next.js App

**Files:**
- Create: `apps/web/` (via create-next-app)
- Modify: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`

- [ ] **Step 1: Scaffold Next.js**

```bash
cd apps
pnpm create next-app web --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

- [ ] **Step 2: Add dependencies**

```bash
cd apps/web
pnpm add @bull-bear/shared @tanstack/react-query lightweight-charts
```

- [ ] **Step 3: Create env config**

Create `apps/web/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: initialize Next.js frontend app"
```

---

### Task 16: API Client + WebSocket Hook

**Files:**
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/hooks/use-websocket.ts`
- Create: `apps/web/src/hooks/use-regime.ts`
- Create: `apps/web/src/lib/query-provider.tsx`

- [ ] **Step 1: Write api.ts**

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export async function fetchAllRegimes(): Promise<RegimeScore[]> { ... }
export async function fetchRegime(asset: Asset): Promise<RegimeWithFeatures> { ... }
export async function fetchFeatures(asset: Asset): Promise<FeatureSnapshot> { ... }
export async function fetchHistory(asset: Asset, params: HistoryParams): Promise<HistoryResponse> { ... }
```

- [ ] **Step 2: Write use-websocket.ts**

```typescript
export function useRegimeWebSocket(assets: Asset[], onUpdate: (data: WsRegimeUpdate) => void) {
  // Connect to WS_URL/ws/stream
  // Send subscribe message for assets
  // On message → parse → call onUpdate
  // Reconnect on disconnect with exponential backoff
  // Cleanup on unmount
}
```

- [ ] **Step 3: Write use-regime.ts**

```typescript
export function useRegimeScores() {
  // TanStack Query for initial fetch (fetchAllRegimes)
  // WebSocket for live updates (merges into query cache)
}

export function useAssetRegime(asset: Asset) {
  // TanStack Query for fetchRegime(asset)
  // WebSocket for live updates
}

export function useHistory(asset: Asset, interval: Interval) {
  // TanStack Query for fetchHistory
}
```

- [ ] **Step 4: Write query-provider.tsx**

```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000 } },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add API client, WebSocket hook, and TanStack Query setup"
```

---

### Task 17: Overview Dashboard Page

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/asset-card.tsx`
- Create: `apps/web/src/components/regime-badge.tsx`
- Create: `apps/web/src/components/regime-chart.tsx`
- Create: `apps/web/src/components/connection-status.tsx`

- [ ] **Step 1: Update layout.tsx**

Add QueryProvider wrapper, set dark theme, global styles.

- [ ] **Step 2: Write regime-badge.tsx**

```typescript
// Color-coded badge: green for bull, yellow for neutral, red for bear
// Props: label: RegimeLabel
```

- [ ] **Step 3: Write asset-card.tsx**

```typescript
// Card showing: asset name, regime score (large), regime badge, direction components
// Links to /asset/[id]
// Props: RegimeScore
```

- [ ] **Step 4: Write regime-chart.tsx**

```typescript
// TradingView Lightweight Charts line series
// Props: data (HistoryPoint[]), color per asset
// Real-time update via useEffect when new data arrives
```

- [ ] **Step 5: Write connection-status.tsx**

```typescript
// Green dot + "Live" when WS connected
// Red dot + "Disconnected" when WS down
```

- [ ] **Step 6: Write overview page.tsx**

```typescript
// Grid of 3 AssetCards (BTC, ETH, SOL)
// RegimeChart showing all 3 assets overlaid
// ConnectionStatus indicator
// useRegimeScores() for data + live updates
```

- [ ] **Step 7: Verify page renders with mock data**

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: add overview dashboard page with asset cards and chart"
```

---

### Task 18: Asset Detail Page

**Files:**
- Create: `apps/web/src/app/asset/[id]/page.tsx`
- Create: `apps/web/src/components/direction-breakdown.tsx`
- Create: `apps/web/src/components/conviction-gauges.tsx`
- Create: `apps/web/src/components/signal-chart.tsx`

- [ ] **Step 1: Write direction-breakdown.tsx**

```typescript
// Bar chart or horizontal bars showing:
//   momentum: 0.196, flow: 0.135, depth: 0.080, funding: 0.150
// Color-coded positive (green) / negative (red)
// Shows weight labels
```

- [ ] **Step 2: Write conviction-gauges.tsx**

```typescript
// Three gauges/progress bars:
//   volConfidence, volumeConfidence, signalAgreement
// Each shows [0, 1] range with color coding
```

- [ ] **Step 3: Write signal-chart.tsx**

```typescript
// Reusable chart component for individual signals over time
// Props: title, data, color, yRange
// Used for momentum, OFI, depth imbalance charts
```

- [ ] **Step 4: Write asset detail page**

```typescript
// Large score display with regime badge
// Full-width regime oscillator chart (with interval selector)
// Direction breakdown component
// Conviction gauges component
// Grid of signal charts (momentum, OFI, depth)
// useAssetRegime(asset) for data + live updates
// useHistory(asset, interval) for chart data
```

- [ ] **Step 5: Verify page renders**

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add asset detail page with direction/conviction breakdown"
```

---

## Chunk 6: Integration + Deployment

### Task 19: End-to-End Integration Test

- [ ] **Step 1: Start infrastructure**

```bash
cd docker && docker-compose up -d
```

- [ ] **Step 2: Start backend**

```bash
cd apps/backend && pnpm dev
```

- [ ] **Step 3: Start frontend**

```bash
cd apps/web && pnpm dev
```

- [ ] **Step 4: Verify full pipeline**

- Open `http://localhost:3000`
- Confirm asset cards show live scores updating every 5s
- Click into BTC detail page — confirm charts and breakdowns render
- Check browser console for WebSocket connection
- Check backend logs for exchange connections and stream activity

- [ ] **Step 5: Commit any fixes**

---

### Task 20: Docker + Deployment Config

**Files:**
- Create: `docker/Dockerfile.backend`
- Create: `apps/web/.env.production`
- Create: `.env.example`

- [ ] **Step 1: Write Dockerfile.backend (using turbo prune)**

```dockerfile
FROM node:20-alpine AS pruner
WORKDIR /app
RUN corepack enable pnpm && npm i -g turbo
COPY . .
RUN turbo prune @bull-bear/backend --docker

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @bull-bear/backend build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/node_modules ./root_modules
ENV NODE_PATH=./root_modules
CMD ["node", "dist/index.js"]
```

- [ ] **Step 1b: Write Dockerfile.web**

```dockerfile
FROM node:20-alpine AS pruner
WORKDIR /app
RUN corepack enable pnpm && npm i -g turbo
COPY . .
RUN turbo prune @bull-bear/web --docker

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter @bull-bear/web build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
CMD ["node", "server.js"]
```

Note: Requires `output: 'standalone'` in `next.config.js` for the standalone build.

- [ ] **Step 2: Create .env.example**

```env
# Backend
PORT=3001
REDIS_URL=redis://localhost:6379
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DB=bullbear
EXCHANGES=binance,bybit,okx

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

- [ ] **Step 3: Test Docker build**

```bash
docker build -f docker/Dockerfile.backend -t bull-bear-backend .
docker run --rm --env-file .env bull-bear-backend
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add Dockerfile and deployment config"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 1–4 | Monorepo scaffold, shared types, Docker infra, backend shell |
| 2 | 5–7 | Storage layer (Redis + ClickHouse), ingestion module |
| 3 | 8–11 | Math utils, signal accumulators, feature engine, regime engine |
| 4 | 12–14 | REST API, WebSocket server, backend wiring |
| 5 | 15–18 | Next.js frontend, overview + detail pages |
| 6 | 19–20 | Integration testing, Docker, deployment |

Each chunk produces testable, runnable software. Chunk 3 (math + engines) is the most critical — it contains the core analytics logic and should be the most thoroughly tested.
