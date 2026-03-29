import type { Asset, DepthLevel } from '@bull-bear/shared';
import type { ExchangeEventHandler, ExchangeAdapter } from './types';

const SYMBOLS: Record<Asset, string> = { BTC: 'btcusdt', ETH: 'ethusdt', SOL: 'solusdt' };

function buildStreamUrl(assets: Asset[]): string {
  const streams = assets.flatMap(a => {
    const s = SYMBOLS[a];
    return [`${s}@aggTrade`, `${s}@depth10@100ms`, `${s}@markPrice@1s`];
  });
  return `wss://fstream.binance.com/stream?streams=${streams.join('/')}`;
}

function assetFromSymbol(symbol: string): Asset | null {
  const upper = symbol.toUpperCase();
  if (upper.startsWith('BTCUSDT')) return 'BTC';
  if (upper.startsWith('ETHUSDT')) return 'ETH';
  if (upper.startsWith('SOLUSDT')) return 'SOL';
  return null;
}

export function createBinanceAdapter(assets: Asset[], onEvent: ExchangeEventHandler): ExchangeAdapter {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  function connect() {
    if (closed) return;
    ws = new WebSocket(buildStreamUrl(assets));

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const data = msg.data;
        const stream: string = msg.stream ?? '';

        if (stream.includes('@aggTrade')) {
          const asset = assetFromSymbol(data.s);
          if (!asset) return;
          onEvent({
            type: 'trade',
            data: {
              asset, exchange: 'binance',
              price: parseFloat(data.p), qty: parseFloat(data.q),
              side: data.m ? 'sell' : 'buy', // m = true means market sell
              ts: data.T,
            },
          });
        } else if (stream.includes('@depth10')) {
          const asset = assetFromSymbol(stream.split('@')[0]);
          if (!asset) return;
          const parseLevels = (levels: [string, string][]): DepthLevel[] =>
            levels.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
          onEvent({
            type: 'depth',
            data: {
              asset, exchange: 'binance',
              bids: parseLevels(data.b), asks: parseLevels(data.a),
              ts: data.E ?? Date.now(),
            },
          });
        } else if (stream.includes('@markPrice')) {
          const asset = assetFromSymbol(data.s);
          if (!asset) return;
          onEvent({
            type: 'funding',
            data: {
              asset, exchange: 'binance',
              rate: parseFloat(data.r), markPrice: parseFloat(data.p),
              ts: data.E,
            },
          });
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      if (!closed) reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  function disconnect() {
    closed = true;
    clearTimeout(reconnectTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
  }

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
