import type { Asset } from '@bull-bear/shared';
import { Pipeline, type PipelineUpdate } from '@bull-bear/engine';
import { createBinanceAdapter } from './binance';
import { createBybitAdapter } from './bybit';
import { createOkxAdapter } from './okx';
import type { ExchangeAdapter, ExchangeEvent } from './types';

export interface ExchangeManagerOptions {
  assets: Asset[];
  onUpdate: (update: PipelineUpdate) => void;
}

export interface ExchangeManager {
  start(): void;
  stop(): void;
  getConnectionStatus(): { binance: boolean; bybit: boolean; okx: boolean };
}

export function createExchangeManager(options: ExchangeManagerOptions): ExchangeManager {
  const { assets, onUpdate } = options;

  const pipeline = new Pipeline({ assets, onUpdate });

  const handleEvent = (event: ExchangeEvent) => {
    switch (event.type) {
      case 'trade': pipeline.onTrade(event.data); break;
      case 'depth': pipeline.onDepth(event.data); break;
      case 'funding': pipeline.onFunding(event.data); break;
    }
  };

  const adapters: ExchangeAdapter[] = [
    createBinanceAdapter(assets, handleEvent),
    createBybitAdapter(assets, handleEvent),
    createOkxAdapter(assets, handleEvent),
  ];

  return {
    start() {
      for (const adapter of adapters) adapter.connect();
      pipeline.start();
    },
    stop() {
      pipeline.stop();
      for (const adapter of adapters) adapter.disconnect();
    },
    getConnectionStatus() {
      return {
        binance: adapters[0].isConnected(),
        bybit: adapters[1].isConnected(),
        okx: adapters[2].isConnected(),
      };
    },
  };
}
