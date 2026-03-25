import Fastify from 'fastify';
import { KeyService } from '../../src/services/key.service.js';
import { GeminiService } from '../../src/services/gemini.service.js';
import { OAuthService } from '../../src/services/oauth.service.js';
import { createAuthMiddleware } from '../../src/middleware/auth.js';
import { registerGeminiRoutes } from '../../src/routes/gemini.js';
import { registerKeyRoutes } from '../../src/routes/keys.js';
import { registerOAuthRoutes } from '../../src/routes/oauth.js';
import {
  SECRET_KEY,
  SALT_KEY,
  ADMIN_KEY,
  DEFAULT_MODEL,
  AUTH_FILE,
} from './fixtures.js';

export async function buildApp(opts: { authFile?: string } = {}) {
  const app = Fastify({ logger: false });

  const keyService = new KeyService(SECRET_KEY, SALT_KEY);
  // Don't call keyService.init() — no file I/O in tests

  const oauthService = new OAuthService(opts.authFile ?? AUTH_FILE);
  await oauthService.init();

  const geminiService = new GeminiService(oauthService, DEFAULT_MODEL);
  const authHook = createAuthMiddleware(keyService);

  registerGeminiRoutes(app, geminiService, authHook);
  registerKeyRoutes(app, keyService, ADMIN_KEY);
  registerOAuthRoutes(app, oauthService, ADMIN_KEY);

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.ready();
  return { app, keyService, oauthService, geminiService };
}
