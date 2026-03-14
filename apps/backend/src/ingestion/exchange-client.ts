import type { Exchange } from '@bull-bear/shared';

export function createExchangeClient(exchangeId: Exchange) {
  // Dynamic import avoids TypeScript namespace issues with ccxt's complex type exports
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ccxt = require('ccxt');
  const ExchangeClass = ccxt.pro[exchangeId];
  return new ExchangeClass({ newUpdates: true });
}
