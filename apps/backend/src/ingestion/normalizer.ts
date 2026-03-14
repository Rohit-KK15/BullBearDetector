import type { Asset, Exchange, Trade, DepthSnapshot, FundingUpdate, DepthLevel } from '@bull-bear/shared';
import { DEPTH_LEVELS } from '@bull-bear/shared';

export function normalizeTrade(ccxtTrade: any, asset: Asset, exchange: Exchange): Trade {
  return {
    asset,
    exchange,
    price: ccxtTrade.price,
    qty: ccxtTrade.amount,
    side: ccxtTrade.side as 'buy' | 'sell',
    ts: ccxtTrade.timestamp,
  };
}

export function normalizeOrderBook(ccxtOrderBook: any, asset: Asset, exchange: Exchange): DepthSnapshot {
  const mapLevels = (levels: number[][]): DepthLevel[] =>
    levels.slice(0, DEPTH_LEVELS).map(([price, qty]) => ({ price, qty }));

  return {
    asset,
    exchange,
    bids: mapLevels(ccxtOrderBook.bids),
    asks: mapLevels(ccxtOrderBook.asks),
    ts: ccxtOrderBook.timestamp ?? Date.now(),
  };
}

export function normalizeFunding(ccxtFunding: any, asset: Asset, exchange: Exchange): FundingUpdate {
  return {
    asset,
    exchange,
    rate: ccxtFunding.fundingRate,
    markPrice: ccxtFunding.markPrice ?? 0,
    ts: ccxtFunding.timestamp ?? Date.now(),
  };
}
