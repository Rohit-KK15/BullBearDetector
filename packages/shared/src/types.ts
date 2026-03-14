// ---- Assets ----
export type Asset = 'BTC' | 'ETH' | 'SOL';
export type Exchange = 'binance' | 'bybit' | 'okx';
export type RegimeLabel = 'bull' | 'neutral' | 'bear';
export type TakerSide = 'buy' | 'sell';

// ---- Raw market data (ingestion → Redis Streams) ----
export interface Trade {
  asset: Asset;
  exchange: Exchange;
  price: number;
  qty: number;
  side: TakerSide;
  ts: number;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthSnapshot {
  asset: Asset;
  exchange: Exchange;
  bids: DepthLevel[];  // top 10, best first
  asks: DepthLevel[];  // top 10, best first
  ts: number;
}

export interface FundingUpdate {
  asset: Asset;
  exchange: Exchange;
  rate: number;
  markPrice: number;
  ts: number;
}

// ---- Computed features (feature engine → Redis Streams) ----
// Note: spec stream payload uses "volatility" as shorthand for "volatilityPercentile".
// We use volatilityPercentile as the canonical name to be explicit.
export interface FeatureSnapshot {
  asset: Asset;
  // directional signals [-1, +1]
  momentum: number;
  ofi: number;
  depthImb: number;
  fundingSentiment: number;
  // conviction raw inputs
  volatilityPercentile: number;  // [0, 1] — percentile rank of realized vol
  volumeRatio: number;           // raw ratio vs EMA
  // conviction computed factors [0, 1]
  volConfidence: number;
  volumeConfidence: number;
  // composites
  direction: number;   // [-1, +1]
  conviction: number;  // [0, 1]
  // price
  markPrice: number;   // latest mark price from exchanges
  ts: number;
}

// ---- Direction breakdown (weighted contributions) ----
export interface DirectionComponents {
  momentum: number;
  flow: number;
  depth: number;
  funding: number;
}

// ---- Conviction breakdown ----
export interface ConvictionFactors {
  volConfidence: number;
  volumeConfidence: number;
  signalAgreement: number;
}

// ---- Regime score (regime engine → Redis + ClickHouse) ----
export interface RegimeScore {
  asset: Asset;
  score: number;       // [-1, +1]
  label: RegimeLabel;
  price: number;       // latest mark price
  direction: DirectionComponents;
  conviction: ConvictionFactors;
  ts: number;
}

// ---- API response types ----
export interface RegimeWithFeatures extends RegimeScore {
  features: FeatureSnapshot;
}

export interface HistoryPoint {
  ts: number;
  score: number;
  label: RegimeLabel;
}

export interface HistoryResponse {
  asset: Asset;
  interval: string;
  data: HistoryPoint[];
}

// ---- Regime transitions ----
export interface RegimeTransition {
  ts: number;
  asset: Asset;
  fromLabel: RegimeLabel;
  toLabel: RegimeLabel;
  score: number;
  conviction: number;
}

// ---- WebSocket messages ----
export interface WsSubscribeMessage {
  action: 'subscribe';
  assets: Asset[];
}

export interface WsRegimeUpdate {
  type: 'regime';
  asset: Asset;
  score: number;
  label: RegimeLabel;
  price: number;
  direction: DirectionComponents;
  conviction: ConvictionFactors;
  ts: number;
}

export type WsClientMessage = WsSubscribeMessage;
export type WsServerMessage = WsRegimeUpdate;
