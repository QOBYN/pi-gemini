import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { buildApp } from '../helpers/build-app.js';
import { mswServer } from '../setup.js';
import { ADMIN_KEY, MOCK_OAUTH_CREDENTIALS } from '../helpers/fixtures.js';
import { writeFile, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { OAuthService } from '../../src/services/oauth.service.js';

const adminHeaders = { Authorization: `Bearer ${ADMIN_KEY}` };

function tmpFile(prefix: string) {
  return `/tmp/${prefix}-${randomBytes(6).toString('hex')}.json`;
}

describe('GET /api/oauth/status', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Use a path guaranteed to not exist
    ({ app } = await buildApp({ authFile: tmpFile('oauth-status-nofile') }));
  });
  afterAll(async () => { await app.close(); });

  it('returns authenticated=false when no auth file', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/oauth/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().authenticated).toBe(false);
  });
});

describe('GET /api/oauth/status — authenticated', () => {
  let app: FastifyInstance;
  let oauthService: OAuthService;
  let authFile: string;

  beforeAll(async () => {
    authFile = tmpFile('oauth-status-auth');
    await writeFile(authFile, JSON.stringify(MOCK_OAUTH_CREDENTIALS), 'utf-8');
    ({ app, oauthService } = await buildApp({ authFile }));
  });
  afterAll(async () => { await app.close(); await unlink(authFile).catch(() => {}); });

  it('returns authenticated=true with email and expiry', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/oauth/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe('test@example.com');
    expect(body.expiresAt).toBeDefined();
  });
});

describe('POST /api/oauth/start', () => {
  let app: FastifyInstance;

  beforeAll(async () => { ({ app } = await buildApp({ authFile: tmpFile('oauth-start') })); });
  afterAll(async () => { await app.close(); });

  it('returns 403 without admin key', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/oauth/start' });
    expect(res.statusCode).toBe(403);
  });

  it('returns Google auth URL with PKCE params', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/oauth/start',
      headers: adminHeaders,
    });
    expect(res.statusCode).toBe(200);
    const { url } = res.json();
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('client_id=681255809395');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8085');
  });
});

describe('POST /api/oauth/submit', () => {
  let app: FastifyInstance;
  let oauthService: OAuthService;

  beforeAll(async () => { ({ app, oauthService } = await buildApp({ authFile: tmpFile('oauth-submit') })); });
  afterAll(async () => { await app.close(); });

  it('returns 403 without admin key', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/oauth/submit',
      headers: { 'Content-Type': 'application/json' },
      payload: { callbackUrl: 'http://localhost:8085/oauth2callback?code=x&state=y' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when no active session', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/oauth/submit',
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      payload: { callbackUrl: 'http://localhost:8085/oauth2callback?code=x&state=y' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('No active OAuth session');
  });

  it('happy path: start then submit valid callback URL', async () => {
    // Get auth URL + extract state
    const startRes = await app.inject({
      method: 'POST', url: '/api/oauth/start',
      headers: { Authorization: `Bearer ${ADMIN_KEY}` },
    });
    const { url } = startRes.json();
    const state = new URL(url).searchParams.get('state')!;

    // MSW intercepts Google token endpoint
    const res = await app.inject({
      method: 'POST', url: '/api/oauth/submit',
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      payload: { callbackUrl: `http://localhost:8085/oauth2callback?code=valid-code&state=${state}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(oauthService.isAuthenticated()).toBe(true);
  });

  it('returns 400 for invalid callback URL format', async () => {
    await app.inject({ method: 'POST', url: '/api/oauth/start', headers: { Authorization: `Bearer ${ADMIN_KEY}` } });
    const res = await app.inject({
      method: 'POST', url: '/api/oauth/submit',
      headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
      payload: { callbackUrl: 'not-a-url' },
    });
    expect(res.statusCode).toBe(400);
  });
});
