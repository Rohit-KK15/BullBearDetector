import type { Asset, Exchange } from './types';

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
  bull: 0.4,
  bear: -0.4,
} as const;

// Hysteresis: once in bull/bear, score must cross back past the exit threshold to return to neutral.
// This prevents rapid flipping on small oscillations around the boundary.
export const REGIME_EXIT_THRESHOLDS = {
  bull: 0.25,   // must drop below 0.25 to exit bull → neutral
  bear: -0.25,  // must rise above -0.25 to exit bear → neutral
} as const;

export const SCORE_SCALING_FACTOR = 1.0;

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
// Vol confidence uses smooth interpolation instead of hard steps.
// Dead zone (low vol): confidence ramps from 0.4 at percentile 0 to 1.0 at percentile 0.3
// Normal zone: 1.0
// Chaotic zone (high vol): confidence ramps from 1.0 at percentile 0.7 to 0.5 at percentile 1.0
export const VOL_CONFIDENCE = {
  deadEnd: 0.3,       // below this percentile, confidence is reduced (was hard cutoff at 0.2)
  chaoticStart: 0.7,  // above this percentile, confidence is reduced (was hard cutoff at 0.8)
  deadFloor: 0.4,     // minimum confidence in dead zone
  chaoticFloor: 0.5,  // minimum confidence in chaotic zone
  normalValue: 1.0,
} as const;

export const VOLUME_CONFIDENCE = {
  floor: 0.3,
  ceiling: 1.0,
  maxRatio: 2.0,
} as const;

export const SIGNAL_AGREEMENT = {
  floor: 0.15,
  range: 0.85,
} as const;

// Minimum number of price samples (5s ticks) before issuing non-neutral labels.
// 36 ticks = 3 minutes of data — enough for momentum to warm up across the 1m window.
export const MIN_WARM_UP_TICKS = 36;

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
