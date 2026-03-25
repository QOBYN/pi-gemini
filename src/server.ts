import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { loadConfig } from './lib/config.js';
import { KeyService } from './services/key.service.js';
import { GeminiService } from './services/gemini.service.js';
import { OAuthService } from './services/oauth.service.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { registerGeminiRoutes } from './routes/gemini.js';
import { registerKeyRoutes } from './routes/keys.js';
import { registerOAuthRoutes } from './routes/oauth.js';
import { RateLimiter } from './lib/rate-limiter.js';
import { UsageService } from './services/usage.service.js';
import { registerUsageRoutes } from './routes/usage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const publicDir = existsSync(join(__dirname, 'public'))
  ? join(__dirname, 'public')
  : join(__dirname, '..', 'public');

async function main() {
  const config = loadConfig();

  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      if (config.allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
  });

  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  app.get('/', async (_request, reply) => {
    return reply.sendFile('index.html');
  });

  app.get('/admin', async (_request, reply) => {
    return reply.sendFile('admin.html');
  });

  const keyService = new KeyService(config.secretKey, config.saltKey);
  await keyService.init();
  const rateLimiter = new RateLimiter();
  const usageDbPath = join(__dirname, '..', 'data', 'usage.db');
  const usageService = new UsageService(usageDbPath);

  const oauthService = new OAuthService(config.authFile);
  await oauthService.init();

  const geminiService = new GeminiService(oauthService, config.defaultModel, usageService);
  const authHook = createAuthMiddleware(keyService);

  registerGeminiRoutes(app, geminiService, authHook);
  registerKeyRoutes(app, keyService, config.adminKey, rateLimiter);
  registerOAuthRoutes(app, oauthService, config.adminKey, rateLimiter);
  registerUsageRoutes(app, usageService, config.adminKey, rateLimiter);

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.listen({ port: config.port, host: '127.0.0.1' });
}

main().catch((err) => {
  process.stderr.write(`Failed to start server: ${String(err)}\n`);
  process.exit(1);
});
