import { describe, it, expect } from 'vitest';
import { normalizeTrade, normalizeOrderBook, normalizeFunding } from './normalizer.js';

describe('normalizeTrade', () => {
  it('maps CCXT trade to Trade type', () => {
    const ccxtTrade = { price: 50000, amount: 1.5, side: 'buy', timestamp: 1700000000000 };
    const result = normalizeTrade(ccxtTrade, 'BTC', 'binance');
    expect(result).toEqual({ asset: 'BTC', exchange: 'binance', price: 50000, qty: 1.5, side: 'buy', ts: 1700000000000 });
  });
});

describe('normalizeOrderBook', () => {
  it('takes top 10 levels from each side', () => {
    const bids = Array.from({ length: 15 }, (_, i) => [50000 - i, 1]);
    const asks = Array.from({ length: 15 }, (_, i) => [50001 + i, 1]);
    const result = normalizeOrderBook({ bids, asks, timestamp: 123 }, 'BTC', 'binance');
    expect(result.bids).toHaveLength(10);
    expect(result.asks).toHaveLength(10);
  });
});

describe('normalizeFunding', () => {
  it('maps CCXT funding to FundingUpdate', () => {
    const ccxtFunding = { fundingRate: 0.0001, markPrice: 50000, timestamp: 123 };
    const result = normalizeFunding(ccxtFunding, 'BTC', 'binance');
    expect(result.rate).toBe(0.0001);
    expect(result.markPrice).toBe(50000);
  });
});
