/**
 * Population standard deviation of values array.
 */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Z-score of the latest value in a rolling window.
 * Returns 0 if stddev is 0 or not enough data.
 */
export function rollingZScore(values: number[], window: number): number {
  if (values.length < 2) return 0;
  const slice = values.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const sd = stddev(slice);
  if (sd === 0) return 0;
  return (values[values.length - 1] - mean) / sd;
}

/**
 * Clamped z-score: clamp to [-clamp, clamp] then normalize to [-1, 1].
 * Returns 0 if stddev is 0.
 */
export function clampedZScore(value: number, mean: number, sd: number, clamp: number = 3): number {
  if (sd === 0) return 0;
  const z = (value - mean) / sd;
  return Math.max(-1, Math.min(1, z / clamp));
}

/**
 * Exponential moving average step.
 * If prev is 0 (first value), returns value directly.
 */
export function ema(prev: number, value: number, periods: number): number {
  const k = 2 / (periods + 1);
  if (prev === 0) return value;
  return value * k + prev * (1 - k);
}

/**
 * Rolling percentile rank: fraction of history values ≤ current value.
 * Returns 0.5 if history is empty.
 */
export function rollingPercentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 0.5;
  const count = history.filter(h => h <= value).length;
  return count / history.length;
}

/**
 * Safe ratio: (a - b) / (a + b). Returns 0 if denominator is 0.
 */
export function safeRatio(a: number, b: number): number {
  const denom = a + b;
  if (denom === 0) return 0;
  return (a - b) / denom;
}
