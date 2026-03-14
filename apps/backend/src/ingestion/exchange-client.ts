import type { Exchange } from '@bull-bear/shared';
import ccxt from 'ccxt';

export function createExchangeClient(exchangeId: Exchange) {
  const ExchangeClass = (ccxt.pro as Record<string, any>)[exchangeId];
  return new ExchangeClass({ newUpdates: true });
}
