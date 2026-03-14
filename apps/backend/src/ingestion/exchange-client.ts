import * as ccxt from 'ccxt';
import type { Exchange } from '@bull-bear/shared';

export function createExchangeClient(exchangeId: Exchange): ccxt.pro.Exchange {
  const ExchangeClass = (ccxt.pro as unknown as Record<string, new (config: object) => ccxt.pro.Exchange>)[exchangeId];
  return new ExchangeClass({
    newUpdates: true,
  });
}
