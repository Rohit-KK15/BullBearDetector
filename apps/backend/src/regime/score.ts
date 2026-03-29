import {
  DIRECTION_WEIGHTS, SCORE_SCALING_FACTOR, REGIME_THRESHOLDS, REGIME_EXIT_THRESHOLDS,
  SIGNAL_AGREEMENT,
  type RegimeLabel, type FeatureSnapshot, type RegimeScore,
  type DirectionComponents, type ConvictionFactors,
} from '@bull-bear/shared';

// Track previous label per asset for hysteresis
const prevLabels = new Map<string, RegimeLabel>();

export function computeRegimeScore(features: FeatureSnapshot): RegimeScore {
  const dirComponents: DirectionComponents = {
    momentum: DIRECTION_WEIGHTS.momentum * features.momentum,
    flow: DIRECTION_WEIGHTS.orderFlow * features.ofi,
    depth: DIRECTION_WEIGHTS.depth * features.depthImb,
    funding: DIRECTION_WEIGHTS.funding * features.fundingSentiment,
  };

  const direction = dirComponents.momentum + dirComponents.flow
    + dirComponents.depth + dirComponents.funding;

  // Signal agreement — include all 4 directional signals for a more robust vote
  const signs = [
    Math.sign(features.momentum),
    Math.sign(features.ofi),
    Math.sign(features.depthImb),
    Math.sign(features.fundingSentiment),
  ];
  const agreementRatio = Math.abs(signs.reduce((a, b) => a + b, 0)) / signs.length;
  const signalAgreement = SIGNAL_AGREEMENT.floor + SIGNAL_AGREEMENT.range * agreementRatio;

  const { volConfidence, volumeConfidence } = features;

  const convictionFactors: ConvictionFactors = {
    volConfidence,
    volumeConfidence,
    signalAgreement,
  };

  const conviction = volConfidence * volumeConfidence * signalAgreement;
  const rawScore = direction * conviction * SCORE_SCALING_FACTOR;
  const score = Math.max(-1, Math.min(1, rawScore));

  // Label assignment with hysteresis
  const prevLabel = prevLabels.get(features.asset) ?? 'neutral';
  let label: RegimeLabel;

  if (prevLabel === 'neutral') {
    // Must cross the full threshold to enter bull/bear
    if (score > REGIME_THRESHOLDS.bull) label = 'bull';
    else if (score < REGIME_THRESHOLDS.bear) label = 'bear';
    else label = 'neutral';
  } else if (prevLabel === 'bull') {
    // Stay bull unless score drops below exit threshold
    if (score < REGIME_EXIT_THRESHOLDS.bull) {
      // Dropped below exit — check if it's actually bear or just neutral
      label = score < REGIME_THRESHOLDS.bear ? 'bear' : 'neutral';
    } else {
      label = 'bull';
    }
  } else {
    // prevLabel === 'bear'
    if (score > REGIME_EXIT_THRESHOLDS.bear) {
      label = score > REGIME_THRESHOLDS.bull ? 'bull' : 'neutral';
    } else {
      label = 'bear';
    }
  }

  prevLabels.set(features.asset, label);

  return {
    asset: features.asset,
    score,
    label,
    price: features.markPrice,
    direction: dirComponents,
    conviction: convictionFactors,
    ts: features.ts,
  };
}
