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
| Features | `features:{asset}` | `{ asset, momentum, ofi, depthImb, fundingSentiment, volatility, volumeRatio, direction, conviction, ts }` |
| Regime | `regime:{asset}` | `{ asset, score, label, direction, conviction, momentumComp, flowComp, depthComp, fundingComp, volConf, volConf, sigAgree, ts }` |

- The regime stream carries all breakdown fields as flat scalars. The API server restructures these into nested `direction` and `conviction` objects for the response.
- Consumer groups per module (e.g., `feature-engine` reads from trades, depth, funding)
- Max stream length capped with `MAXLEN ~10000`
- Features and regime streams emit on 5-second cadence; raw streams are continuous

## ClickHouse Schema

```sql
CREATE TABLE features (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    -- directional signals (all [-1, +1])
    momentum              Float64,
    order_flow_imbalance  Float64,
    depth_imbalance       Float64,
    funding_sentiment     Float64,
    -- conviction signals
    volatility_percentile Float64,   -- [0, 1]
    volume_ratio          Float64,   -- raw ratio vs EMA
    -- composite
    direction             Float64,   -- weighted directional sum [-1, +1]
    conviction            Float64    -- composite confidence [0, 1]
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;

CREATE TABLE regime_scores (
    ts                    DateTime64(3, 'UTC'),
    asset                 LowCardinality(String),
    score                 Float64,
    label                 LowCardinality(String),
    -- direction breakdown
    momentum_component    Float64,
    flow_component        Float64,
    depth_component       Float64,
    funding_component     Float64,
    -- conviction breakdown
    direction             Float64,    -- weighted sum of directional components
    conviction            Float64,    -- product of conviction factors
    vol_confidence        Float64,
    volume_confidence     Float64,
    signal_agreement      Float64
) ENGINE = MergeTree()
ORDER BY (asset, ts)
TTL ts + INTERVAL 90 DAY;
```

- `MergeTree` ordered by `(asset, ts)` for fast range queries
- 90-day TTL keeps storage bounded
- `LowCardinality` for low-cardinality string columns
- Features table stores both raw signals and composites for debugging/charting
- Regime table stores direction components + conviction factors separately

## Signal Algorithms

The regime score separates **direction** (which way the market is leaning) from **conviction** (how confident we should be in that lean). This prevents noisy or contradictory signals from producing misleading scores.

### Directional Signals

All directional signals are normalized to [-1, +1].

#### 1. Multi-Timeframe Momentum

```
r_1m  = clamp(zscore(ln(markPrice_now / markPrice_1m_ago),  window=60), -3, 3) / 3
r_5m  = clamp(zscore(ln(markPrice_now / markPrice_5m_ago),  window=60), -3, 3) / 3
r_15m = clamp(zscore(ln(markPrice_now / markPrice_15m_ago), window=60), -3, 3) / 3

momentum = 0.5 * r_1m + 0.3 * r_5m + 0.2 * r_15m
```

- Each `r_Xm` is explicitly clamped to [-1, +1] via the `clamp(..., -3, 3) / 3` step. Since weights sum to 1.0 and all inputs are [-1, +1], `momentum` is guaranteed [-1, +1] with no additional clamping needed.
- Mark price is used instead of last trade price — it's the fair value across exchanges and less susceptible to manipulation on perps.
- `zscore()` computes a rolling z-score over `window` samples (mean and stddev of the last `window` values).
- Short timeframe weighted highest for responsiveness; longer timeframes confirm the trend. A single 5s return would flip-flop on noise — multi-timeframe smooths this while remaining reactive.
- The 1m, 5m, and 15m look-back prices are maintained as rolling buffers of mark price snapshots (sampled every 5s tick).
- **Cold start:** until enough samples exist for a given timeframe, that term uses 0 and its weight is redistributed proportionally to the other terms.

#### 2. Dollar-Weighted Order Flow Imbalance

```
buyDollarVol  = sum(price * qty where takerSide == 'buy')   // 1-min rolling window
sellDollarVol = sum(price * qty where takerSide == 'sell')
total = buyDollarVol + sellDollarVol
ofi = total == 0 ? 0 : (buyDollarVol - sellDollarVol) / total
```

- Range [-1, +1]. Returns 0 when no trades exist in the window (startup, reconnection, thin markets). Positive = net aggressive buying.
- Dollar-weighted so a single $5M market buy moves the needle more than 1000 tiny trades. Raw quantity-based OFI treats a 0.001 BTC trade the same as a 50 BTC whale order.
- `takerSide` is the aggressor side from CCXT trade data — a taker buy (lifting the ask) is bullish.
- 1-min rolling window (not 5s) for a more stable reading while still being responsive.

#### 3. Distance-Weighted Depth Imbalance

```
weight_i = 1 / (i + 1)    // i=0 (best bid/ask) → 1.0, i=9 → 0.1

bidStrength = sum(qty_i * weight_i for top 10 bid levels)
askStrength = sum(qty_i * weight_i for top 10 ask levels)
total = bidStrength + askStrength
depthImb = total == 0 ? 0 : (bidStrength - askStrength) / total
```

- Range [-1, +1]. Returns 0 when orderbook is empty (disconnected exchange, market open). Positive = more weighted bid support.
- Distance weighting: a 500 BTC bid at the best price is 10x more significant than 500 BTC ten levels deep. Flat weighting would overstate the importance of deep liquidity that may never get hit.
- Aggregated across all connected exchanges (sum all bid/ask levels, then compute imbalance).

#### 4. Funding Sentiment

```
avgFundingRate = mean(latestFundingRate across connected exchanges)
fundingSentiment = clamp(avgFundingRate / 0.0003, -1, 1)
```

- Range [-1, +1]. Positive funding = longs pay shorts = bullish crowding.
- Scaling factor: 0.0003 (3 basis points per 8h). Typical BTC funding is ~0.01% (0.0001). At normal funding, this produces `0.0001/0.0003 = 0.33` — a moderate signal. Extreme funding of 0.1% (0.001) saturates at 1.0.
- Averaged across exchanges to reduce single-exchange anomalies.
- Funding rate updates less frequently than other signals (every 8h on most exchanges). Between updates, the last known rate is held constant.

### Conviction Signals

Conviction signals determine how much to trust the directional score. They are not directional themselves.

#### 5. Volatility Regime Confidence

```
realizedVol = stddev(5s_logReturns over last 60 samples)  // 5-min window
volPercentile = rollingPercentileRank(realizedVol, window=720)  // 1-hour history

volConfidence:
  volPercentile < 0.2  → 0.5   (dead market — signals unreliable, low participation)
  volPercentile 0.2–0.8 → 1.0  (normal trending — signals most trustworthy)
  volPercentile > 0.8  → 0.6   (chaotic — signals conflicting, whipsaw risk)
```

- Range [0.5, 1.0]. Linear interpolation between zone boundaries.
- The 5s log return for vol calculation: `ln(markPrice_now / markPrice_5s_ago)`.
- Percentile rank over 720 samples (1 hour at 5s intervals) provides adaptive thresholds — what counts as "high vol" adjusts to current market conditions.

#### 6. Volume Confirmation

```
dollarVolume_1m = sum(price * qty for all trades in last 1 min)
volumeRatio = dollarVolume_1m / ema(dollarVolume_1m, 30)  // vs 30-min EMA

volumeConfidence = clamp(0.3 + 0.7 * min(volumeRatio, 2.0) / 2.0, 0.3, 1.0)
```

- Range [0.3, 1.0]. Floor at 0.3 — never fully ignore the directional signal even in quiet markets.
- Dollar volume (not trade count) so a few large trades properly boost confidence.
- At 1x EMA (average volume): confidence = 0.65. At 2x+ EMA: confidence = 1.0.
- **Cold start:** `volumeRatio` defaults to 1.0 (neutral, confidence = 0.65) until the EMA has received at least one sample.

#### 7. Signal Agreement

```
signs = [sign(momentum), sign(ofi), sign(depthImb)]
agreementRatio = abs(sum(signs)) / 3

signalAgreement = 0.5 + 0.5 * agreementRatio
```

- Range [0.5, 1.0].
- All 3 non-zero and same sign → `agreementRatio = 1.0` → agreement = 1.0.
- 2-vs-1 split (e.g., two bullish, one bearish) → `agreementRatio = 1/3` → agreement = 0.667.
- Any signal exactly 0 (e.g., `sign(0) = 0`) reduces the sum, pulling agreement down further. Worst case (one signal each way + one zero) → `agreementRatio = 0` → agreement = 0.5.
- Only the three main directional signals are checked. Funding is excluded because it updates infrequently and often lags.
- This prevents the score from being strong when signals contradict each other — e.g., price rising but order flow selling and book thinning on the bid side.

### Regime Score Computation

**Step 1 — Direction:**
```
direction = 0.35 * momentum + 0.30 * ofi + 0.20 * depthImb + 0.15 * fundingSentiment
```

| Signal | Weight | Rationale |
|--------|--------|-----------|
| Momentum | 0.35 | Strongest directional signal, multi-timeframe smoothed |
| Order Flow | 0.30 | Leading indicator — aggressive takers move price |
| Depth | 0.20 | Support/resistance pressure from resting orders |
| Funding | 0.15 | Crowding/sentiment — contrarian at extremes |

Direction range: [-1, +1] (since all inputs are [-1, +1] and weights sum to 1.0).

**Step 2 — Conviction:**
```
conviction = volConfidence * volumeConfidence * signalAgreement
```

Conviction range: [0.075, 1.0] (product of floors: volConfidence=0.5 * volumeConfidence=0.3 * signalAgreement=0.5 = 0.075). In practice, the floor is higher since all three factors rarely bottom out simultaneously.

**Step 3 — Final Score:**
```
score = clamp(direction * conviction * 1.5, -1, 1)
```

- The 1.5 scaling factor compensates for conviction always being ≤ 1.0, ensuring the score can reach ±1.0 when direction is strong and conviction is high.
- Without scaling: max possible score = 1.0 * 1.0 * 1.0 = 1.0 (only when everything is perfect). With 1.5: a direction of 0.7 with full conviction produces 1.05 → clamped to 1.0. This makes strong-but-not-perfect signals still register as clearly bullish/bearish.

**Classification:**
| Score Range | Label |
|------------|-------|
| > 0.3 | bull |
| -0.3 to 0.3 | neutral |
| < -0.3 | bear |

Thresholds and weights are constants in `packages/shared`.

### API Component Values

The API and WebSocket return two groups of components:

**Direction components** (weighted contributions, each bounded [-1, +1]):
- `momentum`: `0.35 * momentum`
- `flow`: `0.30 * ofi`
- `depth`: `0.20 * depthImb`
- `funding`: `0.15 * fundingSentiment`

**Conviction factors** (each [0, 1]):
- `volConfidence`: volatility regime confidence
- `volumeConfidence`: volume confirmation factor
- `signalAgreement`: directional signal agreement

The `score` equals `clamp(sum(direction_components) * product(conviction_factors) * 1.5, -1, 1)`.

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
  "score": 0.78,
  "label": "bull",
  "direction": {
    "momentum": 0.196,
    "flow": 0.135,
    "depth": 0.080,
    "funding": 0.150
  },
  "conviction": {
    "volConfidence": 1.0,
    "volumeConfidence": 0.93,
    "signalAgreement": 1.0
  },
  "ts": 1710000000000
}
```
Direction components are weighted contributions (weight * signal). Conviction factors are multiplied together. See Signal Algorithms for formulas.

### REST Response Schemas

**GET `/api/regime`**
```json
{
  "data": [
    {
      "asset": "BTC",
      "score": 0.78,
      "label": "bull",
      "direction": { "momentum": 0.196, "flow": 0.135, "depth": 0.080, "funding": 0.150 },
      "conviction": { "volConfidence": 1.0, "volumeConfidence": 0.93, "signalAgreement": 1.0 },
      "ts": 1710000000000
    }
  ]
}
```

**GET `/api/regime/:asset`**
```json
{
  "asset": "BTC",
  "score": 0.78,
  "label": "bull",
  "direction": { "momentum": 0.196, "flow": 0.135, "depth": 0.080, "funding": 0.150 },
  "conviction": { "volConfidence": 1.0, "volumeConfidence": 0.93, "signalAgreement": 1.0 },
  "features": {
    "momentum": 0.56,
    "ofi": 0.45,
    "depthImb": 0.40,
    "fundingSentiment": 1.00,
    "volatilityPercentile": 0.45,
    "volumeRatio": 1.8
  },
  "ts": 1710000000000
}
```

**GET `/api/features/:asset`**
```json
{
  "asset": "BTC",
  "momentum": 0.56,
  "ofi": 0.45,
  "depthImb": 0.40,
  "fundingSentiment": 1.00,
  "volatilityPercentile": 0.45,
  "volumeRatio": 1.8,
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
- Direction breakdown: momentum, order flow, depth imbalance, funding sentiment
- Conviction gauges: volatility regime, volume confirmation, signal agreement
- Raw signal charts: multi-timeframe momentum, OFI, depth imbalance over time

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
