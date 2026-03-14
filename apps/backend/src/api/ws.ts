import type { FastifyInstance } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import { WsSubscribeSchema, type Asset, ASSETS, REDIS_STATE_KEYS } from '@bull-bear/shared';

interface Client {
  socket: WebSocket;
  assets: Set<Asset>;
}

export async function setupWebSocket(app: FastifyInstance, redis: Redis) {
  await app.register(import('@fastify/websocket'));

  const clients = new Set<Client>();

  // Poll regime state every 5s and broadcast to subscribed clients
  setInterval(async () => {
    for (const asset of ASSETS) {
      const data = await redis.get(REDIS_STATE_KEYS.regime(asset));
      if (!data) continue;
      const msg = JSON.stringify({ type: 'regime', ...JSON.parse(data) });
      for (const client of clients) {
        if (client.assets.has(asset) && client.socket.readyState === 1) {
          client.socket.send(msg);
        }
      }
    }
  }, 5000);

  app.get('/ws/stream', { websocket: true }, (socket, req) => {
    const client: Client = { socket, assets: new Set() };
    clients.add(client);

    socket.on('message', (raw) => {
      try {
        const msg = WsSubscribeSchema.parse(JSON.parse(String(raw)));
        client.assets = new Set(msg.assets as Asset[]);
      } catch { /* ignore invalid messages */ }
    });

    socket.on('close', () => clients.delete(client));
  });
}
