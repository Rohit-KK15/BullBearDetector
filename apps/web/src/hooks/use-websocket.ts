'use client';

import { useEffect, useRef, useState } from 'react';
import type { Asset, WsRegimeUpdate } from '@bull-bear/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001';

export function useRegimeWebSocket(
  assets: Asset[],
  onUpdate: (data: WsRegimeUpdate) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const assetsKey = assets.join(',');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(`${WS_URL}/ws/stream`);

        ws.onopen = () => {
          setIsConnected(true);
          ws?.send(JSON.stringify({ action: 'subscribe', assets: assetsKey.split(',') }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as WsRegimeUpdate;
            onUpdateRef.current(data);
          } catch { /* ignore */ }
        };

        ws.onclose = () => {
          setIsConnected(false);
          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => ws?.close();
      } catch {
        setIsConnected(false);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
      }
      setIsConnected(false);
    };
  }, [assetsKey]);

  return { isConnected };
}
