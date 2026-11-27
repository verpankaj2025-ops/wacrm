import 'server-only';
import { createHash } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const localAttempts = new Map<string, { count: number; expires: number }>();
function allowLocalAuth(key: string) {
  const now = Date.now();
  for (const [id, entry] of localAttempts) {
    if (entry.expires <= now) localAttempts.delete(id);
  }
  const current = localAttempts.get(key);
  if (current) return ++current.count <= 12;
  if (localAttempts.size >= 4096) return false;
  localAttempts.set(key, { count: 1, expires: now + 600_000 });
  return true;
}

export async function allowAttempt(scope: 'auth' | 'invite', identifier: string) {
  if (scope === 'auth' && process.env.NODE_ENV === 'development' &&
      process.env.RELAXIO_DATA_MODE === 'wacrm' && process.env.RELAXIO_LOCAL_AUTH_LIMIT === '1' &&
      !process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return allowLocalAuth(digest(identifier));
  }
  try {
    const limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(scope === 'invite' ? 8 : 12, '10 m'),
      prefix: 'relaxio:' + scope,
    });
    const result = await limiter.limit(digest(identifier));
    return result.success && result.reason !== 'timeout';
  } catch {
    return false;
  }
}
