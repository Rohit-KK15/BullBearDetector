import Redis from 'ioredis';
import { STREAM_MAXLEN } from '@bull-bear/shared';

export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
  });
}

/**
 * Publish data to a Redis stream using XADD with approximate MAXLEN trim.
 * Data is flattened to key-value pairs for the XADD command.
 */
export async function publishToStream(
  redis: Redis,
  streamKey: string,
  data: Record<string, string | number>,
  maxlen: number = STREAM_MAXLEN,
): Promise<string | null> {
  const fields: (string | number)[] = [];
  for (const [k, v] of Object.entries(data)) {
    fields.push(k, v);
  }
  // XADD key MAXLEN ~ maxlen * field value [field value ...]
  return redis.xadd(streamKey, 'MAXLEN', '~', maxlen, '*', ...fields) as Promise<string | null>;
}

/**
 * Get a JSON-serialized value from Redis and parse it.
 */
export async function getState<T>(redis: Redis, key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

/**
 * Serialize data as JSON and store it in Redis.
 */
export async function setState(redis: Redis, key: string, data: unknown): Promise<void> {
  await redis.set(key, JSON.stringify(data));
}

/**
 * Create a consumer group for a stream. Ignores BUSYGROUP errors if the
 * group already exists.
 */
export async function createConsumerGroup(
  redis: Redis,
  streamKey: string,
  groupName: string,
): Promise<void> {
  try {
    await redis.xgroup('CREATE', streamKey, groupName, '$', 'MKSTREAM');
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('BUSYGROUP')) {
      // Group already exists — not an error
      return;
    }
    throw err;
  }
}

export type StreamMessage = {
  id: string;
  fields: Record<string, string>;
};

export type StreamReadResult = StreamMessage[] | null;

/**
 * Read messages from a stream via XREADGROUP.
 * Returns an array of messages or null if none are available.
 */
export async function readFromStream(
  redis: Redis,
  streamKey: string,
  groupName: string,
  consumerName: string,
  count: number,
  blockMs: number,
): Promise<StreamReadResult> {
  const result = await redis.xreadgroup(
    'GROUP',
    groupName,
    consumerName,
    'COUNT',
    count,
    'BLOCK',
    blockMs,
    'STREAMS',
    streamKey,
    '>',
  ) as Array<[string, Array<[string, string[]]>]> | null;

  if (!result || result.length === 0) return null;

  const [, entries] = result[0];
  if (!entries || entries.length === 0) return null;

  return entries.map(([id, fieldValues]) => {
    const fields: Record<string, string> = {};
    for (let i = 0; i < fieldValues.length; i += 2) {
      fields[fieldValues[i]] = fieldValues[i + 1];
    }
    return { id, fields };
  });
}

/**
 * Acknowledge a processed message in a consumer group.
 */
export async function ackMessage(
  redis: Redis,
  streamKey: string,
  groupName: string,
  messageId: string,
): Promise<number> {
  return redis.xack(streamKey, groupName, messageId);
}
