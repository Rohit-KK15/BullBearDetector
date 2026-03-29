import {
  ASSETS, TICK_INTERVAL_MS, DIRECTION_WEIGHTS,
  type Asset, type FeatureSnapshot, type RegimeScore,
  type Trade, type DepthSnapshot, type FundingUpdate,
} from '@bull-bear/shared';
import {
  MomentumAccumulator, OrderFlowAccumulator, DepthAccumulator,
  FundingAccumulator, VolatilityAccumulator, VolumeAccumulator,
} from './accumulators.js';
import { RegimeScorer } from './score.js';

export interface PipelineUpdate {
  features: FeatureSnapshot;
  regime: RegimeScore;
}

export type PipelineUpdateCallback = (update: PipelineUpdate) => void;

export interface PipelineOptions {
  assets?: Asset[];
  tickIntervalMs?: number;
  volumeTickIntervalMs?: number;
  onUpdate: PipelineUpdateCallback;
}

interface AssetState {
  momentum: MomentumAccumulator;
  orderFlow: OrderFlowAccumulator;
  depth: DepthAccumulator;
  funding: FundingAccumulator;
  volatility: VolatilityAccumulator;
  volume: VolumeAccumulator;
  lastPrice: number;
  markPrice: number;
}

function createAssetState(): AssetState {
  return {
    momentum: new MomentumAccumulator(),
    orderFlow: new OrderFlowAccumulator(),
    depth: new DepthAccumulator(),
    funding: new FundingAccumulator(),
    volatility: new VolatilityAccumulator(),
    volume: new VolumeAccumulator(),
    lastPrice: 0,
    markPrice: 0,
  };
}

/**
 * Environment-agnostic computation pipeline.
 * Works in Node.js, browsers, and Deno — no I/O dependencies.
 */
export class Pipeline {
  private readonly assets: Asset[];
  private readonly tickIntervalMs: number;
  private readonly volumeTickIntervalMs: number;
  private readonly onUpdate: PipelineUpdateCallback;
  private readonly states: Map<Asset, AssetState> = new Map();
  private readonly scorer = new RegimeScorer();
  private featureTimer: ReturnType<typeof setInterval> | null = null;
  private volumeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: PipelineOptions) {
    this.assets = options.assets ?? ASSETS;
    this.tickIntervalMs = options.tickIntervalMs ?? TICK_INTERVAL_MS;
    this.volumeTickIntervalMs = options.volumeTickIntervalMs ?? 60_000;
    this.onUpdate = options.onUpdate;
    for (const asset of this.assets) {
      this.states.set(asset, createAssetState());
    }
  }

  start(): void {
    if (this.featureTimer !== null) return;
    this.volumeTimer = setInterval(() => {
      for (const asset of this.assets) this.states.get(asset)!.volume.tick();
    }, this.volumeTickIntervalMs);
    this.featureTimer = setInterval(() => {
      for (const asset of this.assets) this._tick(asset);
    }, this.tickIntervalMs);
  }

  stop(): void {
    if (this.featureTimer !== null) { clearInterval(this.featureTimer); this.featureTimer = null; }
    if (this.volumeTimer !== null) { clearInterval(this.volumeTimer); this.volumeTimer = null; }
  }

  onTrade(trade: Trade): void {
    const state = this.states.get(trade.asset);
    if (!state) return;
    state.orderFlow.addTrade(trade);
    state.volume.addTrade(trade);
  }

  onDepth(snapshot: DepthSnapshot): void {
    const state = this.states.get(snapshot.asset);
    if (!state) return;
    state.depth.updateDepth(snapshot);
  }

  onFunding(update: FundingUpdate): void {
    const state = this.states.get(update.asset);
    if (!state) return;
    state.funding.updateFunding(update);
    if (update.markPrice > 0) state.markPrice = update.markPrice;
  }

  /** Run a single tick for one asset. Exposed for testing. */
  tick(asset: Asset): PipelineUpdate {
    return this._tick(asset);
  }

  private _tick(asset: Asset): PipelineUpdate {
    const state = this.states.get(asset)!;
    if (state.markPrice > 0) {
      state.momentum.addPrice(state.markPrice);
      if (state.lastPrice > 0) {
        state.volatility.addReturn(Math.log(state.markPrice / state.lastPrice));
      }
      state.lastPrice = state.markPrice;
    }
    const features = this._computeFeatures(asset, state);
    const regime = this.scorer.compute(features);
    const update: PipelineUpdate = { features, regime };
    this.onUpdate(update);
    return update;
  }

  private _computeFeatures(asset: Asset, state: AssetState): FeatureSnapshot {
    const momentum = state.momentum.compute();
    const ofi = state.orderFlow.compute();
    const depthImb = state.depth.compute();
    const fundingSentiment = state.funding.compute();
    const { volPercentile, volConfidence } = state.volatility.compute();
    const { volumeRatio, volumeConfidence } = state.volume.compute();
    const direction =
      DIRECTION_WEIGHTS.momentum * momentum +
      DIRECTION_WEIGHTS.orderFlow * ofi +
      DIRECTION_WEIGHTS.depth * depthImb +
      DIRECTION_WEIGHTS.funding * fundingSentiment;
    const conviction = volConfidence * volumeConfidence;

    return {
      asset, momentum, ofi, depthImb, fundingSentiment,
      volatilityPercentile: volPercentile, volumeRatio,
      volConfidence, volumeConfidence, direction, conviction,
      markPrice: state.markPrice, ts: Date.now(),
    };
  }
}
