import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Fastify from 'fastify';
import { UsageService } from '../../../src/services/usage.service.js';
import { registerUsageRoutes } from '../../../src/routes/usage.js';
import { RateLimiter } from '../../../src/lib/rate-limiter.js';

const ADMIN_KEY = 'test-admin-key';

let tmpDir: string;
let app: ReturnType<typeof Fastify>;
let usageService: UsageService;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'usage-route-test-'));
  usageService = new UsageService(join(tmpDir, 'usage.db'));
  app = Fastify();
  registerUsageRoutes(app, usageService, ADMIN_KEY, new RateLimiter());
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/usage', () => {
  it('returns 429 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usage' });
    expect(res.statusCode).toBe(429);
  });

  it('returns 429 with wrong auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usage',
      headers: { authorization: 'Bearer wrong-key' },
    });
    expect(res.statusCode).toBe(429);
  });

  it('returns usage stats with correct auth', async () => {
    usageService.record(100, 50);
    const res = await app.inject({
      method: 'GET',
      url: '/api/usage',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { today: { input_tokens: number; output_tokens: number }; last30Days: unknown[] };
    expect(body.today.input_tokens).toBe(100);
    expect(body.today.output_tokens).toBe(50);
    expect(Array.isArray(body.last30Days)).toBe(true);
  });

  it('returns zero stats when no data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/usage',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { allTime: { input_tokens: number } };
    expect(body.allTime.input_tokens).toBe(0);
  });
});
