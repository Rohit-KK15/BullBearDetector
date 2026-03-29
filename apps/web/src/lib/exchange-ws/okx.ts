import type { Asset, DepthLevel } from '@bull-bear/shared';
import type { ExchangeEventHandler, ExchangeAdapter } from './types';

const INST_IDS: Record<Asset, string> = { BTC: 'BTC-USDT-SWAP', ETH: 'ETH-USDT-SWAP', SOL: 'SOL-USDT-SWAP' };

export function createOkxAdapter(assets: Asset[], onEvent: ExchangeEventHandler): ExchangeAdapter {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  function assetFromInstId(instId: string): Asset | null {
    for (const [a, id] of Object.entries(INST_IDS)) if (id === instId) return a as Asset;
    return null;
  }

  function connect() {
    if (closed) return;
    ws = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');

    ws.onopen = () => {
      const args = assets.flatMap(a => {
        const id = INST_IDS[a];
        return [
          { channel: 'trades', instId: id },
          { channel: 'books5', instId: id },
          { channel: 'mark-price', instId: id },
          { channel: 'funding-rate', instId: id },
        ];
      });
      ws?.send(JSON.stringify({ op: 'subscribe', args }));

      // OKX ping/pong
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
      }, 25_000);
    };

    ws.onmessage = (event) => {
      try {
        if (event.data === 'pong') return;
        const msg = JSON.parse(event.data);
        if (msg.event) return; // subscription confirmations
        const channel: string = msg.arg?.channel ?? '';
        const instId: string = msg.arg?.instId ?? '';
        const asset = assetFromInstId(instId);
        if (!asset || !msg.data) return;

        if (channel === 'trades') {
          for (const t of msg.data) {
            onEvent({
              type: 'trade',
              data: {
                asset, exchange: 'okx',
                price: parseFloat(t.px), qty: parseFloat(t.sz),
                side: t.side === 'buy' ? 'buy' : 'sell',
                ts: parseInt(t.ts),
              },
            });
          }
        } else if (channel === 'books5') {
          const d = msg.data[0];
          const parseLevels = (levels: [string, string, string, string][]): DepthLevel[] =>
            levels.map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }));
          onEvent({
            type: 'depth',
            data: {
              asset, exchange: 'okx',
              bids: parseLevels(d.bids ?? []),
              asks: parseLevels(d.asks ?? []),
              ts: parseInt(d.ts ?? Date.now()),
            },
          });
        } else if (channel === 'mark-price') {
          const d = msg.data[0];
          onEvent({
            type: 'funding',
            data: {
              asset, exchange: 'okx',
              rate: 0, // mark-price channel doesn't include funding rate
              markPrice: parseFloat(d.markPx),
              ts: parseInt(d.ts),
            },
          });
        } else if (channel === 'funding-rate') {
          const d = msg.data[0];
          onEvent({
            type: 'funding',
            data: {
              asset, exchange: 'okx',
              rate: parseFloat(d.fundingRate),
              markPrice: 0,
              ts: parseInt(d.fundingTime ?? Date.now()),
            },
          });
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
