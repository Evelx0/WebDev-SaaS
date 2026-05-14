import { Redis } from 'ioredis';
import { env } from './env.js';

/**
 * Shared connection options for BullMQ. BullMQ requires
 * `maxRetriesPerRequest: null` and `enableReadyCheck: false` on the
 * connection it uses for blocking commands.
 */
export const bullConnection = {
  url: env.REDIS_URL,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: false,
};

let _redis: Redis | undefined;
export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  }
  return _redis;
}
