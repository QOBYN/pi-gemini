import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile } from 'node:fs/promises';
import { buildApp } from '../helpers/build-app.js';
import {
  ADMIN_KEY,
  FUTURE_DATE,
  PAST_DATE,
  MOCK_OAUTH_CREDENTIALS,
  MOCK_GEMINI_REQUEST,
} from '../helpers/fixtures.js';
import type { FastifyInstance } from 'fastify';
import type { KeyService } from '../../src/services/key.service.js';

const AUTH_FILE_E2E = '/tmp/test-gemini-e2e-auth.json';
const adminHeaders = { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' };

let app: FastifyInstance;
let keyService: KeyService;

async function createValidKey(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/keys',
    headers: adminHeaders,
    payload: { name: 'gemini-test-key', expiresAt: FUTURE_DATE },
  });
  return res.json().key as string;
}

beforeAll(async () => {
  await writeFile(AUTH_FILE_E2E, JSON.stringify(MOCK_OAUTH_CREDENTIALS), 'utf-8');
  ({ app, keyService } = await buildApp({ authFile: AUTH_FILE_E2E }));
});

afterAll(async () => {
  await app.close();
});

describe('GET /v1beta/models', () => {
  it('returns model list without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1beta/models' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.models)).toBe(true);
    expect(body.models.length).toBeGreaterThan(0);
    expect(body.models[0].name).toContain('models/');
  });
});

describe('GET /v1beta/models/:model', () => {
  it('returns single model info', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1beta/models/gemini-2.0-flash' });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('models/gemini-2.0-flash');
  });
});

describe('POST /v1beta/models/gemini-2.0-flash:generateContent', () => {
  it('returns 401 without Bearer token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      headers: { 'Content-Type': 'application/json' },
      payload: MOCK_GEMINI_REQUEST,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('invalid_api_key');
  });

  it('returns 401 for invalid key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      headers: { Authorization: 'Bearer sk-invalid', 'Content-Type': 'application/json' },
      payload: MOCK_GEMINI_REQUEST,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for expired key', async () => {
    const { key } = await keyService.createKey({ name: 'expired', expiresAt: PAST_DATE });
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload: MOCK_GEMINI_REQUEST,
    });
    expect(res.statusCode).toBe(401);
  });

  it('proxies request to Gemini and returns response (MSW intercepts)', async () => {
    const key = await createValidKey();
    const res = await app.inject({
      method: 'POST',
      url: '/v1beta/models/gemini-2.0-flash:generateContent',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload: MOCK_GEMINI_REQUEST,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
  });
});

describe('POST /v1beta/models/gemini-2.0-flash:streamGenerateContent (real HTTP)', () => {
  let port: number;
  let serverApp: FastifyInstance;

  beforeAll(async () => {
    await writeFile(AUTH_FILE_E2E, JSON.stringify(MOCK_OAUTH_CREDENTIALS), 'utf-8');
    ({ app: serverApp } = await buildApp({ authFile: AUTH_FILE_E2E }));
    await serverApp.listen({ port: 0, host: '127.0.0.1' });
    port = (serverApp.server.address() as { port: number }).port;
  });

  afterAll(async () => { await serverApp.close(); });

  it('returns 401 without auth on real server', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/v1beta/models/gemini-2.0-flash:streamGenerateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(MOCK_GEMINI_REQUEST),
    });
    expect(res.status).toBe(401);
  });

  it('streams SSE response with valid key', async () => {
    // Create key via inject on serverApp
    const createRes = await serverApp.inject({
      method: 'POST',
      url: '/api/keys',
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      payload: { name: 'stream-key', expiresAt: FUTURE_DATE },
    });
    const key = createRes.json().key as string;

    const res = await fetch(
      `http://127.0.0.1:${port}/v1beta/models/gemini-2.0-flash:streamGenerateContent`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(MOCK_GEMINI_REQUEST),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('data:');
    expect(text).toContain('[DONE]');
  });
});
