import type { FastifyInstance } from 'fastify';
import { createAdminAuth } from './keys.js';
import type { UsageService } from '../services/usage.service.js';
import type { RateLimiter } from '../lib/rate-limiter.js';

export function registerUsageRoutes(
  app: FastifyInstance,
  usageService: UsageService,
  adminKey: string,
  rateLimiter: RateLimiter,
): void {
  const adminAuth = createAdminAuth(adminKey, rateLimiter);

  app.get('/api/usage', { preHandler: [adminAuth] }, async (_request, reply) => {
    try {
      return reply.send(usageService.getStats());
    } catch {
      return reply.status(500).send({ error: 'Failed to fetch usage stats' });
    }
  });
}
