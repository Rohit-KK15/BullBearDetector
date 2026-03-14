import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ioredis before importing any module that imports it
// ---------------------------------------------------------------------------
const mockXadd = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockXgroup = vi.fn();
const mockXreadgroup = vi.fn();
const mockXack = vi.fn();

const mockRedisInstance = {
  xadd: mockXadd,
  get: mockGet,
  set: mockSet,
  xgroup: mockXgroup,
  xreadgroup: mockXreadgroup,
  xack: mockXack,
};

vi.mock('ioredis', () => {
  const RedisMock = vi.fn(() => mockRedisInstance);
  return { default: RedisMock };
});

// ---------------------------------------------------------------------------
// Now import the module under test
// ---------------------------------------------------------------------------
import {
  createRedisClient,
  publishToStream,
  getState,
  setState,
  createConsumerGroup,
  readFromStream,
  ackMessage,
} from './redis.js';
import { STREAM_MAXLEN } from '@bull-bear/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRedis() {
  return mockRedisInstance as unknown as import('ioredis').default;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createRedisClient
// ---------------------------------------------------------------------------
describe('createRedisClient', () => {
  it('constructs a Redis instance with the provided URL', async () => {
    const Redis = (await import('ioredis')).default;
    createRedisClient('redis://localhost:6379');
    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// publishToStream
// ---------------------------------------------------------------------------
describe('publishToStream', () => {
  it('calls xadd with MAXLEN ~ and flattened key-value pairs', async () => {
    mockXadd.mockResolvedValue('1234-0');

    const redis = makeRedis();
    const data = { price: 100, volume: 2.5 };
    const result = await publishToStream(redis, 'trades:BTC', data);

    expect(mockXadd).toHaveBeenCalledWith(
      'trades:BTC',
      'MAXLEN',
      '~',
      STREAM_MAXLEN,
      '*',
      'price',
      100,
      'volume',
      2.5,
    );
    expect(result).toBe('1234-0');
  });

  it('uses the provided maxlen override', async () => {
    mockXadd.mockResolvedValue('5678-0');
    const redis = makeRedis();
    await publishToStream(redis, 'trades:ETH', { price: 50 }, 500);

    expect(mockXadd).toHaveBeenCalledWith(
      'trades:ETH',
      'MAXLEN',
      '~',
      500,
      '*',
      'price',
      50,
    );
  });
});

// ---------------------------------------------------------------------------
// getState / setState
// ---------------------------------------------------------------------------
describe('getState', () => {
  it('returns null when key does not exist', async () => {
    mockGet.mockResolvedValue(null);
    const redis = makeRedis();
    const result = await getState(redis, 'state:regime:BTC');
    expect(result).toBeNull();
  });

  it('parses JSON stored in Redis', async () => {
    const stored = { score: 0.7, regime: 'bull' };
    mockGet.mockResolvedValue(JSON.stringify(stored));
    const redis = makeRedis();
    const result = await getState<typeof stored>(redis, 'state:regime:BTC');
    expect(result).toEqual(stored);
  });
});

describe('setState', () => {
  it('serialises data as JSON and calls SET', async () => {
    mockSet.mockResolvedValue('OK');
    const redis = makeRedis();
    const payload = { score: -0.4, regime: 'bear' };
    await setState(redis, 'state:regime:ETH', payload);

    expect(mockSet).toHaveBeenCalledWith(
      'state:regime:ETH',
      JSON.stringify(payload),
    );
  });
});

describe('getState / setState roundtrip', () => {
  it('stores and retrieves a value without corruption', async () => {
    const payload = { score: 0.1, regime: 'neutral', ts: 1234567890 };
    let stored: string | null = null;

    mockSet.mockImplementation((_key: string, value: string) => {
      stored = value;
      return Promise.resolve('OK');
    });
    mockGet.mockImplementation(() => Promise.resolve(stored));

    const redis = makeRedis();
    await setState(redis, 'state:regime:SOL', payload);
    const result = await getState<typeof payload>(redis, 'state:regime:SOL');

    expect(result).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
// createConsumerGroup
// ---------------------------------------------------------------------------
describe('createConsumerGroup', () => {
  it('calls XGROUP CREATE with MKSTREAM', async () => {
    mockXgroup.mockResolvedValue('OK');
    const redis = makeRedis();
    await createConsumerGroup(redis, 'trades:BTC', 'feature-engine');

    expect(mockXgroup).toHaveBeenCalledWith(
      'CREATE',
      'trades:BTC',
      'feature-engine',
      '$',
      'MKSTREAM',
    );
  });

  it('silently ignores BUSYGROUP error', async () => {
    mockXgroup.mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists'));
    const redis = makeRedis();
    await expect(createConsumerGroup(redis, 'trades:BTC', 'feature-engine')).resolves.toBeUndefined();
  });

  it('rethrows non-BUSYGROUP errors', async () => {
    mockXgroup.mockRejectedValue(new Error('WRONGTYPE Operation against a key'));
    const redis = makeRedis();
    await expect(createConsumerGroup(redis, 'trades:BTC', 'feature-engine')).rejects.toThrow('WRONGTYPE');
  });
});

// ---------------------------------------------------------------------------
// readFromStream
// ---------------------------------------------------------------------------
describe('readFromStream', () => {
  it('calls xreadgroup with correct arguments', async () => {
    mockXreadgroup.mockResolvedValue(null);
    const redis = makeRedis();
    await readFromStream(redis, 'trades:BTC', 'feature-engine', 'consumer-1', 10, 5000);

    expect(mockXreadgroup).toHaveBeenCalledWith(
      'GROUP',
      'feature-engine',
      'consumer-1',
      'COUNT',
      10,
      'BLOCK',
      5000,
      'STREAMS',
      'trades:BTC',
      '>',
    );
  });

  it('returns null when no messages are available', async () => {
    mockXreadgroup.mockResolvedValue(null);
    const redis = makeRedis();
    const result = await readFromStream(redis, 'trades:BTC', 'g', 'c', 10, 0);
    expect(result).toBeNull();
  });

  it('parses stream messages into structured objects', async () => {
    const rawResult = [
      ['trades:BTC', [['1700-0', ['price', '100', 'volume', '2.5']]]],
    ];
    mockXreadgroup.mockResolvedValue(rawResult);
    const redis = makeRedis();
    const result = await readFromStream(redis, 'trades:BTC', 'g', 'c', 10, 0);

    expect(result).toEqual([
      { id: '1700-0', fields: { price: '100', volume: '2.5' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// ackMessage
// ---------------------------------------------------------------------------
describe('ackMessage', () => {
  it('calls xack with correct arguments and returns count', async () => {
    mockXack.mockResolvedValue(1);
    const redis = makeRedis();
    const result = await ackMessage(redis, 'trades:BTC', 'feature-engine', '1700-0');

    expect(mockXack).toHaveBeenCalledWith('trades:BTC', 'feature-engine', '1700-0');
    expect(result).toBe(1);
  });
});
