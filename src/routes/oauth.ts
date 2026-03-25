import type { FastifyInstance } from 'fastify';
import type { OAuthService } from '../services/oauth.service.js';
import type { RateLimiter } from '../lib/rate-limiter.js';
import { createAdminAuth } from './keys.js';

export function registerOAuthRoutes(
  app: FastifyInstance,
  oauthService: OAuthService,
  adminKey: string,
  rateLimiter: RateLimiter,
) {
  const adminAuth = createAdminAuth(adminKey, rateLimiter);

  // GET /api/oauth/status — public
  app.get('/api/oauth/status', async (_request, reply) => {
    return reply.send(oauthService.getTokenStatus());
  });

  // POST /api/oauth/start — admin only, returns Google auth URL
  app.post('/api/oauth/start', { preHandler: [adminAuth] }, async (_request, reply) => {
    const authUrl = oauthService.startOAuthFlow();
    return reply.send({ url: authUrl });
  });

  // POST /api/oauth/submit — admin only, user pastes callback URL here
  app.post<{ Body: { callbackUrl: string } }>(
    '/api/oauth/submit',
    {
      preHandler: [adminAuth],
      schema: {
        body: {
          type: 'object',
          required: ['callbackUrl'],
          properties: { callbackUrl: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      try {
        await oauthService.handleCallbackUrl(request.body.callbackUrl);
        return reply.send({ success: true, email: oauthService.getTokenStatus().email });
      } catch (err) {
        return reply.status(400).send({ error: String(err) });
      }
    },
  );
}
