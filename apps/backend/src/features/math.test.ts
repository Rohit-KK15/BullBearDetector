import { describe, it, expect } from 'vitest';
import { rollingZScore, clampedZScore, ema, rollingPercentileRank, stddev, safeRatio } from './math.js';

describe('stddev', () => {
  it('returns 0 for empty array', () => expect(stddev([])).toBe(0));
  it('returns 0 for constant values', () => expect(stddev([5, 5, 5])).toBe(0));
  it('computes correctly for [2, 4, 4, 4, 5, 5, 7, 9]', () => expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 0));
});

describe('rollingZScore', () => {
  it('returns 0 for constant values', () => expect(rollingZScore([5, 5, 5, 5], 4)).toBe(0));
  it('returns positive for above-mean value', () => expect(rollingZScore([1, 2, 3, 4, 10], 5)).toBeGreaterThan(0));
  it('returns 0 for single value', () => expect(rollingZScore([5], 10)).toBe(0));
  it('handles window shorter than data', () => {
    const result = rollingZScore([1, 2, 3, 4, 5, 100], 3);
    expect(result).toBeGreaterThan(0);
  });
});

describe('clampedZScore', () => {
  it('clamps extreme positive to 1', () => expect(clampedZScore(100, 0, 1)).toBe(1));
  it('clamps extreme negative to -1', () => expect(clampedZScore(-100, 0, 1)).toBe(-1));
  it('returns 0 when stddev is 0', () => expect(clampedZScore(5, 3, 0)).toBe(0));
  it('normalizes within range', () => {
    const result = clampedZScore(1.5, 0, 1, 3);
    expect(result).toBeCloseTo(0.5, 1);
  });
});

describe('ema', () => {
  it('first value equals the value itself (prev=0)', () => expect(ema(0, 10, 10)).toBe(10));
  it('converges toward repeated value', () => {
    let val = 0;
    for (let i = 0; i < 100; i++) val = ema(val, 50, 10);
    expect(val).toBeCloseTo(50, 1);
  });
});

describe('rollingPercentileRank', () => {
  it('returns 1.0 for max value', () => expect(rollingPercentileRank(10, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(1));
  it('returns ~0.5 for median', () => {
    const history = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(rollingPercentileRank(5, history)).toBe(0.5);
  });
  it('returns 0.5 for empty history', () => expect(rollingPercentileRank(5, [])).toBe(0.5));
});

describe('safeRatio', () => {
  it('returns 0 when both zero', () => expect(safeRatio(0, 0)).toBe(0));
  it('returns 1 when b is 0', () => expect(safeRatio(5, 0)).toBe(1));
  it('returns -1 when a is 0', () => expect(safeRatio(0, 5)).toBe(-1));
  it('computes correctly for normal values', () => expect(safeRatio(3, 1)).toBeCloseTo(0.5));
});
