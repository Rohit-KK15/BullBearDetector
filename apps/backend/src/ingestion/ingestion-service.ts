import type { Redis } from 'ioredis';
import { ASSETS, SYMBOLS, STREAM_KEYS, type Asset, type Exchange } from '@bull-bear/shared';
import { publishToStream } from '../storage/redis.js';
import { createExchangeClient } from './exchange-client.js';
import { normalizeTrade, normalizeOrderBook, normalizeFunding } from './normalizer.js';

export async function startIngestion(redis: Redis, config: { exchanges: { enabled: Exchange[] } }) {
  for (const exchangeId of config.exchanges.enabled) {
    const exchange = createExchangeClient(exchangeId);

    for (const asset of ASSETS) {
      const symbol = SYMBOLS[asset];

      // Watch trades
      watchTradesLoop(exchange, redis, asset, exchangeId, symbol);
      // Watch order book
      watchOrderBookLoop(exchange, redis, asset, exchangeId, symbol);
      // Poll funding rate
      pollFundingRate(exchange, redis, asset, exchangeId, symbol);
    }

    console.log(`Ingestion connected: ${exchangeId}`);
  }
}

async function watchTradesLoop(exchange: any, redis: Redis, asset: Asset, exchangeId: Exchange, symbol: string) {
  while (true) {
    try {
      const trades = await exchange.watchTrades(symbol);
      for (const t of trades) {
        const trade = normalizeTrade(t, asset, exchangeId);
        await publishToStream(redis, STREAM_KEYS.trades(asset), trade as unknown as Record<string, string | number>);
      }
    } catch (err) {
      console.error(`Trade watch error ${exchangeId}/${asset}:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function watchOrderBookLoop(exchange: any, redis: Redis, asset: Asset, exchangeId: Exchange, symbol: string) {
  while (true) {
    try {
      const ob = await exchange.watchOrderBook(symbol);
      const snapshot = normalizeOrderBook(ob, asset, exchangeId);
      await publishToStream(redis, STREAM_KEYS.depth(asset), {
        asset: snapshot.asset,
        exchange: snapshot.exchange,
        bids: JSON.stringify(snapshot.bids),
        asks: JSON.stringify(snapshot.asks),
        ts: snapshot.ts,
      });
    } catch (err) {
      console.error(`OrderBook watch error ${exchangeId}/${asset}:`, err);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function pollFundingRate(exchange: any, redis: Redis, asset: Asset, exchangeId: Exchange, symbol: string) {
  while (true) {
    try {
      const funding = await exchange.fetchFundingRate(symbol);
      const update = normalizeFunding(funding, asset, exchangeId);
      await publishToStream(redis, STREAM_KEYS.funding(asset), update as unknown as Record<string, string | number>);
    } catch (err) {
      console.error(`Funding poll error ${exchangeId}/${asset}:`, err);
    }
    await new Promise(r => setTimeout(r, 60_000)); // poll every 60s
  }
}
