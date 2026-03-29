export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

export function rollingZScore(values: number[], window: number): number {
  if (values.length < 2) return 0;
  const slice = values.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const sd = stddev(slice);
  if (sd === 0) return 0;
  return (values[values.length - 1] - mean) / sd;
}

export function clampedZScore(value: number, mean: number, sd: number, clamp: number = 3): number {
  if (sd === 0) return 0;
  const z = (value - mean) / sd;
  return Math.max(-1, Math.min(1, z / clamp));
}

export function ema(prev: number, value: number, periods: number): number {
  const k = 2 / (periods + 1);
  if (prev === 0) return value;
  return value * k + prev * (1 - k);
}

export function rollingPercentileRank(value: number, history: number[]): number {
  if (history.length === 0) return 0.5;
  const count = history.filter(h => h <= value).length;
  return count / history.length;
}

export function safeRatio(a: number, b: number): number {
  const denom = a + b;
  if (denom === 0) return 0;
  return (a - b) / denom;
}
