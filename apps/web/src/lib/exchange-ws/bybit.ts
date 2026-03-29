import type { Asset, DepthLevel } from '@bull-bear/shared';
import type { ExchangeEventHandler, ExchangeAdapter } from './types';

const SYMBOLS: Record<Asset, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' };

export function createBybitAdapter(assets: Asset[], onEvent: ExchangeEventHandler): ExchangeAdapter {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  function assetFromSymbol(symbol: string): Asset | null {
    for (const [a, s] of Object.entries(SYMBOLS)) if (s === symbol) return a as Asset;
    return null;
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');

    ws.onopen = () => {
      const args = assets.flatMap(a => {
        const s = SYMBOLS[a];
        return [`publicTrade.${s}`, `orderbook.10.${s}`, `tickers.${s}`];
      });
      ws?.send(JSON.stringify({ op: 'subscribe', args }));

      // Bybit requires ping every 20s
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
      }, 20_000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.op === 'pong' || msg.op === 'subscribe') return;
        const topic: string = msg.topic ?? '';

        if (topic.startsWith('publicTrade.')) {
          const symbol = topic.replace('publicTrade.', '');
          const asset = assetFromSymbol(symbol);
          if (!asset || !msg.data) return;
          for (const t of msg.data) {
            onEvent({
              type: 'trade',
              data: {
                asset, exchange: 'bybit',
                price: parseFloat(t.p), qty: parseFloat(t.v),
                side: t.S === 'Buy' ? 'buy' : 'sell',
                ts: parseInt(t.T),
              },
            });
          }
        } else if (topic.startsWith('orderbook.10.')) {
          const symbol = topic.replace('orderbook.10.', '');
          const asset = assetFromSymbol(symbol);
          if (!asset || !msg.data) return;
          const parseLevels = (levels: [string, string][]): DepthLevel[] =>
            levels.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
          onEvent({
            type: 'depth',
            data: {
              asset, exchange: 'bybit',
              bids: parseLevels(msg.data.b ?? []),
              asks: parseLevels(msg.data.a ?? []),
              ts: parseInt(msg.ts ?? Date.now()),
            },
          });
        } else if (topic.startsWith('tickers.')) {
          const symbol = topic.replace('tickers.', '');
          const asset = assetFromSymbol(symbol);
          if (!asset || !msg.data) return;
          const d = msg.data;
          if (d.fundingRate && d.markPrice) {
            onEvent({
              type: 'funding',
              data: {
                asset, exchange: 'bybit',
                rate: parseFloat(d.fundingRate),
                markPrice: parseFloat(d.markPrice),
                ts: parseInt(msg.ts ?? Date.now()),
              },
            });
          }
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      clearInterval(pingTimer);
      if (!closed) reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  function disconnect() {
    closed = true;
    clearTimeout(reconnectTimer);
    clearInterval(pingTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
  }

  return {
    connect,
    disconnect,
    isConnected: () => ws?.readyState === WebSocket.OPEN,
  };
}
