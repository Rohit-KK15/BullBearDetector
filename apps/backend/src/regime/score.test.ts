import { describe, it, expect, beforeEach } from 'vitest';
import { computeRegimeScore } from './score.js';
import type { FeatureSnapshot } from '@bull-bear/shared';

function makeFeatures(overrides: Partial<FeatureSnapshot> = {}): FeatureSnapshot {
  return {
    asset: 'BTC',
    momentum: 0, ofi: 0, depthImb: 0, fundingSentiment: 0,
    volatilityPercentile: 0.5, volumeRatio: 1.0,
    volConfidence: 1.0, volumeConfidence: 1.0,
    direction: 0, conviction: 0, markPrice: 50000, ts: Date.now(),
    ...overrides,
  };
}

// Reset hysteresis state between tests by forcing a neutral score
function resetHysteresis(asset: string = 'BTC') {
  computeRegimeScore(makeFeatures({ asset: asset as FeatureSnapshot['asset'] }));
}

describe('computeRegimeScore', () => {
  beforeEach(() => {
    resetHysteresis('BTC');
    resetHysteresis('ETH');
    resetHysteresis('SOL');
  });

  it('strong bull: all signals positive + high conviction → bull label', () => {
    const f = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeGreaterThan(0.4);
    expect(r.label).toBe('bull');
  });

  it('strong bear: all signals negative + high conviction → bear label', () => {
    const f = makeFeatures({ momentum: -0.8, ofi: -0.7, depthImb: -0.6, fundingSentiment: -1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeLessThan(-0.4);
    expect(r.label).toBe('bear');
  });

  it('neutral: mixed signals → score near 0', () => {
    const f = makeFeatures({ momentum: 0.5, ofi: -0.5, depthImb: 0.3, fundingSentiment: -0.3, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r = computeRegimeScore(f);
    expect(Math.abs(r.score)).toBeLessThan(0.2);
    expect(r.label).toBe('neutral');
  });

  it('low conviction dampens strong direction', () => {
    const f = makeFeatures({ momentum: 1.0, ofi: 1.0, depthImb: 1.0, fundingSentiment: 1.0, volConfidence: 0.3, volumeConfidence: 0.3 });
    const r = computeRegimeScore(f);
    expect(Math.abs(r.score)).toBeLessThan(0.3);
  });

  it('signal disagreement reduces score significantly', () => {
    const agree = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const disagree = makeFeatures({ momentum: 0.8, ofi: -0.7, depthImb: 0.6, fundingSentiment: -1.0, volConfidence: 1.0, volumeConfidence: 1.0 });
    const agreeScore = Math.abs(computeRegimeScore(agree).score);
    resetHysteresis();
    const disagreeScore = Math.abs(computeRegimeScore(disagree).score);
    expect(agreeScore).toBeGreaterThan(disagreeScore * 2);
  });

  it('score is clamped to [-1, 1]', () => {
    const f = makeFeatures({ momentum: 1, ofi: 1, depthImb: 1, fundingSentiment: 1, volConfidence: 1, volumeConfidence: 1 });
    const r = computeRegimeScore(f);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.score).toBeGreaterThanOrEqual(-1);
  });

  it('moderate signals stay neutral (no false bull/bear)', () => {
    // A single strong OFI with weak others should NOT trigger bull
    const f = makeFeatures({ momentum: 0.15, ofi: 0.8, depthImb: 0.05, fundingSentiment: 0, volConfidence: 1.0, volumeConfidence: 0.65 });
    const r = computeRegimeScore(f);
    expect(r.label).toBe('neutral');
  });

  it('hysteresis: bull does not flip to neutral on small dip', () => {
    // First push into bull
    const bullish = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 0.8, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r1 = computeRegimeScore(bullish);
    expect(r1.label).toBe('bull');

    // Now slightly weaker but still above exit threshold (0.25)
    const weakerBull = makeFeatures({ momentum: 0.5, ofi: 0.4, depthImb: 0.3, fundingSentiment: 0.5, volConfidence: 1.0, volumeConfidence: 1.0 });
    const r2 = computeRegimeScore(weakerBull);
    // Should stay bull due to hysteresis (score ~0.37 > exit threshold 0.25)
    expect(r2.label).toBe('bull');
  });

  it('hysteresis: bull exits to neutral when score drops below exit threshold', () => {
    // Push into bull
    const bullish = makeFeatures({ momentum: 0.8, ofi: 0.7, depthImb: 0.6, fundingSentiment: 0.8, volConfidence: 1.0, volumeConfidence: 1.0 });
    computeRegimeScore(bullish);

    // Now drop to near zero
    const flat = makeFeatures({ momentum: 0.1, ofi: 0.1, depthImb: 0.0, fundingSentiment: 0.0, volConfidence: 1.0, volumeConfidence: 0.5 });
    const r = computeRegimeScore(flat);
    expect(r.label).toBe('neutral');
  });

  it('all signals at zero → neutral with near-zero score', () => {
    const f = makeFeatures({});
    const r = computeRegimeScore(f);
    expect(r.score).toBeCloseTo(0, 2);
    expect(r.label).toBe('neutral');
  });
});
