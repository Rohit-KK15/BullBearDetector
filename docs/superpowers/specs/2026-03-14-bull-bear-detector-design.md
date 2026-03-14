# BullBearDetector — Design Spec

## Overview

A real-time crypto market regime detection platform that streams exchange data, computes microstructure signals, and produces a bull/bear/neutral regime score for BTC, ETH, and SOL. Scores update every 5 seconds and power a web dashboard.

Pure analytics tool — no trading integration.

## Assets

- BTC/USDT (perpetual futures)
- ETH/USDT (perpetual futures)
- SOL/USDT (perpetual futures)

Perpetual futures are used because they provide funding rate (sentiment signal) and mark price (fair value reference) that spot markets lack.

## Architecture

**Pipeline Monolith** — single backend process with modular internals, communicating via Redis Streams. Modules are logically decoupled and can be split into separate services later with zero code changes.

```
Exchanges (WS) → Ingestion → Redis Streams → Feature Engine → Regime Engine
                                                                    ↓
                                                        Redis (live) + ClickHouse (historical)
                                                                    ↓
                                                        Fastify API + WS Server
                                                                    ↓
                                                            Next.js Frontend
```

### Exchanges

Connect to Binance, Bybit, and OKX via CCXT Pro (WebSocket). Data is aggregated across all exchanges into one score per asset.

### Data Ingested

| Data Type | Source | Frequency |
|-----------|--------|-----------|
| Trades | All exchanges | Continuous |
| Orderbook depth | All exchanges | Continuous (top 10 levels) |
| Mark price | All exchanges | Continuous |
| Funding rate | All exchanges | Per funding interval |

## Tech Stack

### Backend
- Node.js + TypeScript
- Fastify (REST API)
- ws (WebSocket server)
- CCXT Pro (exchange connections)
- ioredis (Redis client)
- @clickhouse/client (ClickHouse client)

### Frontend
- Next.js (App Router)
- React + TypeScript
- TailwindCSS
- TradingView Lightweight Charts
- TanStack Query
- WebSocket client

### Infrastructure
- Redis (streams + live state store)
- ClickHouse (historical time-series)
- Docker + docker-compose (local dev)
- Fly.io (backend deployment)
- Vercel (frontend deployment)

### Monorepo
- Turborepo + pnpm

## Monorepo Structure

```
bull-bear-detector/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── ingestion/      # CCXT WebSocket, normalization, validation
│   │       ├── features/       # Feature computation engine
│   │       ├── regime/         # Regime scoring engine
│   │       ├── api/            # Fastify routes + WebSocket server
│   │       ├── storage/        # Redis + ClickHouse clients
│   │       └── index.ts        # Bootstrap & orchestration
│   └── web/
│       └── src/
│           ├── app/            # App Router pages
│           ├── components/     # UI components + charts
│           ├── hooks/          # useRegime, useWebSocket, etc.
│           └── lib/            # API client, types
├── packages/
│   └── shared/
│       └── src/
│           ├── types.ts        # Asset, RegimeScore, Feature, etc.
│           ├── constants.ts    # Asset list, thresholds, weights
│           └── schemas.ts      # Zod validation schemas
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.web
│   └── docker-compose.yml      # Redis + ClickHouse + backend
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── tsconfig.base.json
```

## Redis Streams Design

| Stream | Key Pattern | Payload |
|--------|------------|---------|
| Trades | `trades:{asset}` | `{ asset, exchange, price, qty, side, ts }` |
| Depth | `depth:{asset}` | `{ asset, exchange, bids, asks, ts }` (top 10 levels) |
| Funding | `funding:{asset}` | `{ asset, exchange, rate, markPrice, ts }` |
| Features | `features:{asset}` | `{ asset, logReturn, volatility, volumeSpike, orderFlowImb, depthImb, fundingSentiment, ts }` |
| Regime | `regime:{asset}` | `{ asset, score, label, components, ts }` |

- Consumer groups per module (e.g., `feature-engine` reads from trades, depth, funding)
- Max stream length capped with `MAXLEN ~10000`
- Features and regime streams emit on 5-second cadence; raw streams are continuous

## ClickHouse Schema

```sql
CREATE TABLE features (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    log_return            Float64,
    volatility            Float64,
    volume_spike          Float64,
    order_flow_imbalance  Float64,
    depth_imbalance       Float64,
    funding_sentiment     Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE regime_scores (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    score                 Float64,
    label                 LowCardinality(String),
    return_component      Float64,
    volatility_component  Float64,
    volume_component      Float64,
    flow_component        Float64,
    depth_component       Float64,
    funding_component     Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;
```

- `MergeTree` ordered by `(asset, ts)` for fast range queries
- 90-day TTL keeps storage bounded
- `LowCardinality` for low-cardinality string columns

## Signal Algorithms

### 1. Rolling Log Returns
```
logReturn = ln(markPrice_now / markPrice_5s_ago)
```
Computed from mark price (fair value across exchanges) per 5-second window. Mark price is preferred over last trade price for perps as it's less susceptible to manipulation.

### 2. Realized Volatility
```
vol = stddev(logReturns over last 60 samples)  // 5-minute window
```
Scaled to [0, 1] using a rolling percentile rank.

### 3. Volume Spike
```
volumeSpike = volume_5s / ema(volume_5s, 60)  // ratio vs 5-min EMA
```
Ratio > 1 means above-average volume. Confirms trend strength.

### 4. Order Flow Imbalance
```
buyVolume  = sum(trade.qty where side == 'buy')   // 5s window
sellVolume = sum(trade.qty where side == 'sell')
ofi = (buyVolume - sellVolume) / (buyVolume + sellVolume)
```
Range [-1, +1]. Positive = aggressive buying dominance.

### 5. Orderbook Depth Imbalance
```
bidDepth = sum(qty for top 10 bid levels)
askDepth = sum(qty for top 10 ask levels)
depthImb = (bidDepth - askDepth) / (bidDepth + askDepth)
```
Range [-1, +1]. Positive = more bid support.

### 6. Funding Sentiment
```
fundingSentiment = clamp(fundingRate / 0.01, -1, 1)
```
Funding rate normalized to [-1, +1]. Positive funding = longs pay shorts = bullish crowding. Negative = bearish crowding. Divided by 0.01 (1% — a high but not extreme rate) as the scaling factor.

### 7. Regime Score

**Step 1 — compute raw directional score:**
```
rawScore = w1 * zscore(logReturn)
         + w2 * ofi
         + w3 * depthImb
         + w6 * fundingSentiment
```

**Step 2 — compute modifiers (using rawScore):**
```
volAdjustment       = -(max(0, volatility - 0.5)) * sign(rawScore)
volumeConfirmation  = sign(rawScore) * max(0, volumeSpike - 1) * 0.5
```

**Step 3 — final score:**
```
score = rawScore + w4 * volAdjustment + w5 * volumeConfirmation
```
Clamped to [-1, +1].

**Weights:**
| Factor | Weight | Rationale |
|--------|--------|-----------|
| Returns (w1) | 0.25 | Strongest directional signal |
| Order Flow (w2) | 0.25 | Leading indicator |
| Depth (w3) | 0.15 | Support/resistance pressure |
| Volatility (w4) | 0.15 | Regime confidence modifier |
| Volume (w5) | 0.10 | Trend confirmation |
| Funding (w6) | 0.10 | Crowding/sentiment indicator |

**Normalization:**
- `zscore()` applies a rolling z-score clamped to [-3, +3], then divided by 3 to produce [-1, +1]. Applied only to `logReturn` since it has unbounded range.
- `ofi`, `depthImb`, and `fundingSentiment` are already bounded to [-1, +1] and pass through as-is.

**Modifiers:**
- `volAdjustment` pulls score toward 0 when volatility is extreme (high uncertainty → more neutral). Only activates when volatility > 0.5 (above median), otherwise contributes zero.
- `volumeConfirmation` amplifies the directional signal when volume exceeds its EMA. Only activates when `volumeSpike > 1` (above average), otherwise contributes zero.

**Component values:** The API and WebSocket return 6 component values representing each factor's contribution to the final score:
- `return`: `w1 * zscore(logReturn)`
- `flow`: `w2 * ofi`
- `depth`: `w3 * depthImb`
- `volatility`: `w4 * volAdjustment`
- `volume`: `w5 * volumeConfirmation`
- `funding`: `w6 * fundingSentiment`

All components are bounded to [-1, +1]. The sum of all 6 components equals the final `score` (before clamping).

**Classification:**
| Score Range | Label |
|------------|-------|
| > 0.3 | bull |
| -0.3 to 0.3 | neutral |
| < -0.3 | bear |

Final score clamped to [-1, +1]. Thresholds and weights are constants in `packages/shared`.

## API

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/regime` | All assets' latest regime scores |
| GET | `/api/regime/:asset` | Latest regime score + features for one asset |
| GET | `/api/history/:asset?from=&to=&interval=` | Historical regime scores for charting |
| GET | `/api/features/:asset` | Latest computed features for one asset |

### WebSocket

| Path | Description |
|------|-------------|
| `/ws/stream` | Real-time regime + feature updates. Client subscribes per asset. |

**WS subscribe message (client → server):**
```json
{ "action": "subscribe", "assets": ["BTC", "ETH", "SOL"] }
```

**WS regime update (server → client):**
```json
{
  "type": "regime",
  "asset": "BTC",
  "score": 0.44,
  "label": "bull",
  "components": {
    "return": 0.18,
    "flow": 0.10,
    "depth": 0.08,
    "volatility": -0.04,
    "volume": 0.05,
    "funding": 0.07
  },
  "ts": 1710000000000
}
```
Component values are weighted contributions, each bounded to [-1, +1]. They sum to the `score` (before clamping). See Signal Algorithms § Regime Score for formulas.

### REST Response Schemas

**GET `/api/regime`**
```json
{
  "data": [
    {
      "asset": "BTC",
      "score": 0.44,
      "label": "bull",
      "components": { "return": 0.18, "flow": 0.10, "depth": 0.08, "volatility": -0.04, "volume": 0.05, "funding": 0.07 },
      "ts": 1710000000000
    }
  ]
}
```

**GET `/api/regime/:asset`**
```json
{
  "asset": "BTC",
  "score": 0.62,
  "label": "bull",
  "components": { "return": 0.18, "flow": 0.10, "depth": 0.08, "volatility": -0.04, "volume": 0.05, "funding": 0.07 },
  "features": {
    "logReturn": 0.0012,
    "volatility": 0.34,
    "volumeSpike": 1.2,
    "orderFlowImb": 0.41,
    "depthImb": 0.55,
    "fundingSentiment": 0.72
  },
  "ts": 1710000000000
}
```

**GET `/api/features/:asset`**
```json
{
  "asset": "BTC",
  "logReturn": 0.0012,
  "volatility": 0.34,
  "volumeSpike": 1.2,
  "orderFlowImb": 0.41,
  "depthImb": 0.55,
  "fundingSentiment": 0.72,
  "ts": 1710000000000
}
```

**GET `/api/history/:asset?from=&to=&interval=`**

`interval` valid values: `5s` (raw), `1m`, `5m`, `15m`, `1h`, `1d`. ClickHouse aggregates using `avg(score)` per bucket. The `label` for each bucket is re-derived by applying the classification thresholds (>0.3 bull, <-0.3 bear, else neutral) to the aggregated score. Default interval: `1m`. `from`/`to` are Unix timestamps in milliseconds. Default range: last 1 hour.

```json
{
  "asset": "BTC",
  "interval": "1m",
  "data": [
    { "ts": 1710000000000, "score": 0.44, "label": "bull" },
    { "ts": 1710000060000, "score": 0.38, "label": "bull" }
  ]
}
```

## Frontend

### Overview Page (`/`)
- All 3 assets as cards showing: regime score, label (color-coded), current price, key metrics, mini sparkline
- Combined regime oscillator chart (TradingView Lightweight Charts) with all assets overlaid
- Live connection indicator

### Asset Detail Page (`/asset/:id`)
- Large regime score display with label
- Regime oscillator chart (full-width, time-selectable)
- Realized volatility chart
- Order flow imbalance chart
- Volume chart
- Depth imbalance chart
- Score component breakdown with individual values and weights

### Real-time Updates
- WebSocket connection subscribes to all assets on overview, single asset on detail page
- TanStack Query for initial data fetch, WebSocket for live updates
- Optimistic UI updates on each 5-second tick

## Deployment

### Local Development
- `docker-compose up` starts Redis + ClickHouse
- `pnpm dev` runs backend + frontend via Turborepo

### Production
- **Backend:** Single Docker container on Fly.io
- **Frontend:** Vercel (auto-deploy from main branch)
- **Redis:** Fly.io Redis or Upstash
- **ClickHouse:** ClickHouse Cloud free tier or self-hosted on Fly.io
