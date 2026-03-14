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
    price: features.markPrice,
    direction: dirComponents,
    conviction: convictionFactors,
    ts: features.ts,
  };
}
