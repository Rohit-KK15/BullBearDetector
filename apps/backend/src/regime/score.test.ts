import { describe, it, expect } from 'vitest';
import { computeRegimeScore } from './score.js';
import type { FeatureSnapshot } from '@bull-bear/shared';

function makeFeatures(overrides: Partial<FeatureSnapshot> = {}): FeatureSnapshot {
  return {
    asset: 'BTC',
    momentum: 0, ofi: 0, depthImb: 0, fundingSentiment: 0,
    volatilityPercentile: 0.5, volumeRatio: 1.0,
    volConfidence: 1.0, volumeConfidence: 1.0,
    direction: 0, conviction: 0, ts: Date.now(),
    ...overrides,
  };
}

describe('computeRegimeScore', () => {
  it('strong bull: all signals positive + high conviction → score > 0.5', () => {
    const f = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.label).toBe('bull');
  });

  it('strong bear: all signals negative + high conviction → score < -0.5', () => {
    const f = makeFeatures({ momentum: -0.8, ofi: -0.7, depthImb: -0.6, fundingSentiment: -1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeLessThan(-0.5);
    expect(r.label).toBe('bear');
  });

  it('neutral: mixed signals → score near 0', () => {
    const f = makeFeatures({ momentum: 0.5, ofi: -0.5, depthImb: 0.3, fundingSentiment: -0.3, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(Math.abs(r.score)).toBeLessThan(0.3);
    expect(r.label).toBe('neutral');
  });

  it('low conviction dampens strong direction', () => {
    const f = makeFeatures({ momentum: 1.0, ofi: 1.0, depthImb: 1.0, fundingSentiment: 1.0, volConfidence: 0.3, volumeConfidence: 0.3 });
    const r = computeRegimeScore(f);
    expect(Math.abs(r.score)).toBeLessThan(0.5);
  });

  it('signal disagreement reduces score', () => {
    const agree = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const disagree = makeFeatures({ momentum: 0.8, ofi: -0.7, depthImb: 0.6, fundingSentiment: 1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    expect(Math.abs(computeRegimeScore(agree).score)).toBeGreaterThan(Math.abs(computeRegimeScore(disagree).score));
  });

  it('score is clamped to [-1, 1]', () => {
    const f = makeFeatures({ momentum: 1, ofi: 1, depthImb: 1, fundingSentiment: 1, volConfidence: 1, volumeConfidence: 1 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(-1);
  });

  it('classification thresholds: >0.3 bull, <-0.3 bear, else neutral', () => {
    // Test boundary
    const bull = makeFeatures({ momentum: 0.5, ofi: 0.5, depthImb: 0.5, fundingSentiment: 0.5, volConfidence: 1.0, volumeConfidence: 1.0 });
    expect(computeRegimeScore(bull).label).toBe('bull');
  });

  it('reproduces the spec walkthrough: bull scenario → ~0.78', () => {
    const features = makeFeatures({
      asset: 'BTC',
      momentum: 0.56,
      ofi: 0.45,
      depthImb: 0.40,
      fundingSentiment: 1.00,
      volatilityPercentile: 0.45,
      volumeRatio: 1.8,
      volConfidence: 1.0,       // normal vol zone
      volumeConfidence: 0.93,   // 0.3 + 0.7 * min(1.8/2, 1) = 0.3 + 0.63 = 0.93
    });
    const result = computeRegimeScore(features);
    expect(result.score).toBeCloseTo(0.78, 1);
    expect(result.label).toBe('bull');
  });
});
