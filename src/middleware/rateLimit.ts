import type { FastifyReply, FastifyRequest } from 'fastify';

export type BasicRateLimitOptions = {
  maxRequests: number;
  windowMs: number;
};

type Counter = {
  count: number;
  resetAt: number;
};

const counters = new Map<string, Counter>();

export function createBasicRateLimiter(options: BasicRateLimitOptions) {
  return async function basicRateLimit(request: FastifyRequest, reply: FastifyReply) {
    const routePath =
      typeof request.routeOptions.url === 'string' && request.routeOptions.url.length > 0
        ? request.routeOptions.url
        : request.url;
    const key = `${request.ip}:${routePath}`;
    const now = Date.now();
    const current = counters.get(key);

    if (!current || current.resetAt <= now) {
      counters.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return;
    }

    current.count += 1;
    if (current.count > options.maxRequests) {
      reply.code(429).send({
        status: 'denied',
        reason: 'rate_limited',
      });
    }
  };
}

export function clearRateLimiterState() {
  counters.clear();
}
