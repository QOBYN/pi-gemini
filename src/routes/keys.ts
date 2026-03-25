import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { KeyService } from '../services/key.service.js';
import type { RateLimiter } from '../lib/rate-limiter.js';
import type { ApiKeyCreateRequest } from '../types/key.types.js';

export function createAdminAuth(adminKey: string, rateLimiter: RateLimiter) {
  const adminKeyBuf = Buffer.from(`Bearer ${adminKey}`);

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = (request.headers['cf-connecting-ip'] as string) ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    const authHeader = request.headers.authorization ?? '';

    const keyCorrect = (() => {
      try {
        const provided = Buffer.from(authHeader);
        return provided.length === adminKeyBuf.length && timingSafeEqual(provided, adminKeyBuf);
      } catch { return false; }
    })();

    if (keyCorrect) {
      rateLimiter.recordSuccess(ip);
      return;
    }

    const { blockedUntil, failures } = rateLimiter.check(ip);

    if (blockedUntil > 0) {
      if (failures >= 5) {
        await new Promise(r => setTimeout(r, 30_000));
        request.raw.socket.destroy();
        return;
      }
      const secondsLeft = Math.ceil((blockedUntil - Date.now()) / 1000);
      return reply.status(429).send({
        error: { message: `Too many failed attempts. Try again in ${secondsLeft}s.` },
      });
    }

    const newFailures = rateLimiter.recordFailure(ip);
    if (newFailures >= 5) {
      rateLimiter.block(ip, Number.MAX_SAFE_INTEGER);
      await new Promise(r => setTimeout(r, 30_000));
      request.raw.socket.destroy();
      return;
    }
    const delayMs = Math.min(2 ** (newFailures - 1) * 1000, 5 * 60 * 1000);
    rateLimiter.block(ip, delayMs);
    return reply.status(429).send({
      error: { message: `Too many failed attempts. Try again in ${Math.ceil(delayMs / 1000)}s.` },
    });
  };
}

export function registerKeyRoutes(
  app: FastifyInstance,
  keyService: KeyService,
  adminKey: string,
  rateLimiter: RateLimiter,
) {
  const adminAuth = createAdminAuth(adminKey, rateLimiter);

  app.get('/api/keys', { preHandler: [adminAuth] }, async (_request, reply) => {
    return reply.send(keyService.listKeys());
  });

  app.post<{ Body: ApiKeyCreateRequest }>(
    '/api/keys',
    {
      preHandler: [adminAuth],
      schema: {
        body: {
          type: 'object',
          required: ['name', 'expiresAt'],
          properties: {
            name: { type: 'string' },
            expiresAt: { type: 'string' },
            rateLimit: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await keyService.createKey(request.body);
      return reply.status(201).send(result);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/keys/:id/toggle',
    { preHandler: [adminAuth] },
    async (request, reply) => {
      const toggled = await keyService.toggleKey(request.params.id);
      if (!toggled) {
        return reply.status(404).send({ error: { message: 'Key not found' } });
      }
      return reply.send({ success: true });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/keys/:id',
    { preHandler: [adminAuth] },
    async (request, reply) => {
      const deleted = await keyService.deleteKey(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: { message: 'Key not found' } });
      }
      return reply.status(204).send();
    },
  );
}
