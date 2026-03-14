'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Asset, WsRegimeUpdate } from '@bull-bear/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL!;

export function useRegimeWebSocket(
  assets: Asset[],
  onUpdate: (data: WsRegimeUpdate) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_URL}/ws/stream`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'subscribe', assets }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsRegimeUpdate;
        onUpdateRef.current(data);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [assets]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
  };
}
