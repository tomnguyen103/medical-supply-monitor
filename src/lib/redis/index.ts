import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

import { env, integrations, requireEnv } from "@/lib/env";

export const isRedisConfigured = integrations.redis;

let cachedRedis: Redis | null = null;
let cachedLimiter: Ratelimit | null = null;

/** Returns the Upstash Redis client; throws if unconfigured. */
export function getRedis(): Redis {
  if (!cachedRedis) {
    cachedRedis = new Redis({
      url: requireEnv(env.redis.url, "UPSTASH_REDIS_REST_URL"),
      token: requireEnv(env.redis.token, "UPSTASH_REDIS_REST_TOKEN"),
    });
  }
  return cachedRedis;
}

/** Redis client or null when not configured (callers can skip caching). */
export function tryGetRedis(): Redis | null {
  return integrations.redis ? getRedis() : null;
}

function getRateLimiter(): Ratelimit | null {
  if (!integrations.redis) return null;
  if (!cachedLimiter) {
    cachedLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(60, "1 m"),
      prefix: "msm:ratelimit",
      analytics: false,
    });
  }
  return cachedLimiter;
}

/**
 * Sliding-window rate-limit check. When Redis is not configured this allows the
 * request (so local dev is unblocked) and reports `configured: false`.
 */
export async function checkRateLimit(
  identifier: string,
): Promise<{ success: boolean; configured: boolean }> {
  const limiter = getRateLimiter();
  if (!limiter) return { success: true, configured: false };
  const { success } = await limiter.limit(identifier);
  return { success, configured: true };
}
