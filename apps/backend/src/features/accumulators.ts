import { rollingZScore, clampedZScore, ema, rollingPercentileRank, stddev, safeRatio } from './math.js';
import {
  MOMENTUM_WEIGHTS, ZSCORE_WINDOW, ZSCORE_CLAMP, OFI_WINDOW_MS,
  DEPTH_LEVELS, FUNDING_SCALING_FACTOR, VOL_SAMPLES, VOL_PERCENTILE_WINDOW,
  VOLUME_EMA_PERIODS, VOL_CONFIDENCE, VOLUME_CONFIDENCE,
  type Trade, type DepthSnapshot, type FundingUpdate, type Exchange,
} from '@bull-bear/shared';

// ---- MomentumAccumulator ----

export class MomentumAccumulator {
  private prices: number[] = [];

  addPrice(price: number): void {
    this.prices.push(price);
  }

  compute(): number {
    if (this.prices.length < 2) return 0;

    // Timeframe sample counts (5s ticks)
    const SAMPLES_1M = 12;
    const SAMPLES_5M = 60;
    const SAMPLES_15M = 180;

    const weights: Record<string, number> = {
      r1m: MOMENTUM_WEIGHTS.r1m,
      r5m: MOMENTUM_WEIGHTS.r5m,
      r15m: MOMENTUM_WEIGHTS.r15m,
    };

    const sampleCounts: Record<string, number> = {
      r1m: SAMPLES_1M,
      r5m: SAMPLES_5M,
      r15m: SAMPLES_15M,
    };

    // Determine available terms (need at least 2 samples for z-score)
    const availableTerms: Record<string, number> = {};
    for (const [key, count] of Object.entries(sampleCounts)) {
      if (this.prices.length >= 2 && this.prices.length >= Math.min(count, 2)) {
        availableTerms[key] = weights[key];
      }
    }

    // Filter to terms where we have enough samples for meaningful z-score
    const filteredTerms: Record<string, number> = {};
    for (const [key, count] of Object.entries(sampleCounts)) {
      if (this.prices.length >= count) {
        filteredTerms[key] = weights[key];
      } else if (this.prices.length >= 2) {
        // Still include but only if we have at least 2 samples
        filteredTerms[key] = weights[key];
      }
    }

    // Cold start weight redistribution: only include terms with enough samples
    // A term is "available" if we have enough samples for its window
    const termsWithSamples: Record<string, number> = {};
    for (const [key, count] of Object.entries(sampleCounts)) {
      if (this.prices.length >= count) {
        termsWithSamples[key] = weights[key];
      }
    }

    // If we don't have enough for any full window, use what we have with just r1m
    // available as long as we have >= 2 prices
    let activeTerms: Record<string, number>;
    if (Object.keys(termsWithSamples).length === 0) {
      // Cold start: only r1m is "available" (use what we have)
      activeTerms = { r1m: weights.r1m };
    } else {
      activeTerms = termsWithSamples;
    }

    const scale = 1 / Object.values(activeTerms).reduce((a, b) => a + b, 0);

    let momentum = 0;
    for (const [key, w] of Object.entries(activeTerms)) {
      const count = sampleCounts[key];
      const slice = this.prices.slice(-count);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const sd = stddev(slice);
      const latest = this.prices[this.prices.length - 1];
      const z = clampedZScore(latest, mean, sd, ZSCORE_CLAMP);
      momentum += z * w * scale;
    }

    return Math.max(-1, Math.min(1, momentum));
  }
}

// ---- OrderFlowAccumulator ----

export class OrderFlowAccumulator {
  private trades: Trade[] = [];

  addTrade(trade: Trade): void {
    this.trades.push(trade);
    // Prune trades older than OFI_WINDOW_MS
    const cutoff = trade.ts - OFI_WINDOW_MS;
    this.trades = this.trades.filter(t => t.ts >= cutoff);
  }

  compute(): number {
    if (this.trades.length === 0) return 0;

    let buyVol = 0;
    let sellVol = 0;

    for (const trade of this.trades) {
      const dollarVol = trade.price * trade.qty;
      if (trade.side === 'buy') {
        buyVol += dollarVol;
      } else {
        sellVol += dollarVol;
      }
    }

    return safeRatio(buyVol, sellVol);
  }
}

// ---- DepthAccumulator ----

export class DepthAccumulator {
  private snapshots: Map<Exchange, DepthSnapshot> = new Map();

  updateDepth(snapshot: DepthSnapshot): void {
    this.snapshots.set(snapshot.exchange, snapshot);
  }

  compute(): number {
    if (this.snapshots.size === 0) return 0;

    let totalImbalance = 0;
    let count = 0;

    for (const snapshot of this.snapshots.values()) {
      const levels = DEPTH_LEVELS;
      let weightedBidQty = 0;
      let weightedAskQty = 0;

      // Bids: best first (closest to mid), weight = 1/rank
      for (let i = 0; i < Math.min(snapshot.bids.length, levels); i++) {
        const rank = i + 1;
        weightedBidQty += snapshot.bids[i].qty * (1 / rank);
      }

      // Asks: best first (closest to mid), weight = 1/rank
      for (let i = 0; i < Math.min(snapshot.asks.length, levels); i++) {
        const rank = i + 1;
        weightedAskQty += snapshot.asks[i].qty * (1 / rank);
      }

      totalImbalance += safeRatio(weightedBidQty, weightedAskQty);
      count++;
    }

    return count === 0 ? 0 : totalImbalance / count;
  }
}

// ---- FundingAccumulator ----

export class FundingAccumulator {
  private rates: Map<Exchange, number> = new Map();

  updateFunding(update: FundingUpdate): void {
    this.rates.set(update.exchange, update.rate);
  }

  compute(): number {
    if (this.rates.size === 0) return 0;

    const values = Array.from(this.rates.values());
    const avgRate = values.reduce((a, b) => a + b, 0) / values.length;

    return Math.max(-1, Math.min(1, avgRate / FUNDING_SCALING_FACTOR));
  }
}

// ---- VolatilityAccumulator ----

export class VolatilityAccumulator {
  private recentReturns: number[] = [];
  private volHistory: number[] = [];

  addReturn(logReturn: number): void {
    this.recentReturns.push(logReturn);
    if (this.recentReturns.length > VOL_SAMPLES) {
      this.recentReturns.shift();
    }

    // Compute current realized vol and push to history
    if (this.recentReturns.length >= 2) {
      const currentVol = stddev(this.recentReturns);
      this.volHistory.push(currentVol);
      if (this.volHistory.length > VOL_PERCENTILE_WINDOW) {
        this.volHistory.shift();
      }
    }
  }

  compute(): { realizedVol: number; volPercentile: number; volConfidence: number } {
    if (this.recentReturns.length < 2) {
      return { realizedVol: 0, volPercentile: 0.5, volConfidence: 1.0 };
    }

    const realizedVol = stddev(this.recentReturns);
    const volPercentile = rollingPercentileRank(realizedVol, this.volHistory);

    let volConfidence: number;
    if (volPercentile < VOL_CONFIDENCE.deadThreshold) {
      volConfidence = VOL_CONFIDENCE.deadValue;
    } else if (volPercentile > VOL_CONFIDENCE.chaoticThreshold) {
      volConfidence = VOL_CONFIDENCE.chaoticValue;
    } else {
      volConfidence = VOL_CONFIDENCE.normalValue;
    }

    return { realizedVol, volPercentile, volConfidence };
  }
}

// ---- VolumeAccumulator ----

export class VolumeAccumulator {
  private currentBucketVolume = 0;
  private emaVolume = 0;
  private hasHistory = false;

  addTrade(trade: Trade): void {
    this.currentBucketVolume += trade.price * trade.qty;
  }

  tick(): void {
    this.emaVolume = ema(this.emaVolume, this.currentBucketVolume, VOLUME_EMA_PERIODS);
    this.hasHistory = true;
    this.currentBucketVolume = 0;
  }

  compute(): { volumeRatio: number; volumeConfidence: number } {
    if (!this.hasHistory || this.emaVolume === 0) {
      return { volumeRatio: 1, volumeConfidence: 0.65 };
    }

    const volumeRatio = this.currentBucketVolume / this.emaVolume;
    const { floor, ceiling, maxRatio } = VOLUME_CONFIDENCE;
    const volumeConfidence = floor + (ceiling - floor) * Math.min(volumeRatio / maxRatio, 1);

    return { volumeRatio, volumeConfidence };
  }
}
