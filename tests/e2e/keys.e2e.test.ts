import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/build-app.js';
import { ADMIN_KEY, FUTURE_DATE } from '../helpers/fixtures.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await buildApp());
});

afterAll(async () => {
  await app.close();
});

const adminHeaders = { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' };
const adminHeadersNoBody = { Authorization: `Bearer ${ADMIN_KEY}` };
const badHeaders = { Authorization: 'Bearer wrong-key', 'Content-Type': 'application/json' };

describe('GET /api/keys', () => {
  it('returns 200 with empty array for valid admin key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/keys', headers: adminHeaders });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns 403 for invalid admin key', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/keys', headers: badHeaders });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/keys', () => {
  it('creates key and returns raw key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: adminHeaders,
      payload: { name: 'e2e-key', expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.key).toMatch(/^sk-/);
    expect(body.name).toBe('e2e-key');
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: adminHeaders,
      payload: { name: 'no-expiry' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 for invalid admin key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: badHeaders,
      payload: { name: 'k', expiresAt: FUTURE_DATE },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('PATCH /api/keys/:id/toggle', () => {
  it('toggles key status', async () => {
    // Create key first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: adminHeaders,
      payload: { name: 'toggle-test', expiresAt: FUTURE_DATE },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/keys/${id}/toggle`,
      headers: adminHeadersNoBody,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Verify it's inactive now
    const listRes = await app.inject({ method: 'GET', url: '/api/keys', headers: adminHeadersNoBody });
    const key = listRes.json().find((k: { id: string }) => k.id === id);
    expect(key.isActive).toBe(false);
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/keys/nonexistent/toggle',
      headers: adminHeadersNoBody,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/keys/:id', () => {
  it('deletes key and returns 204', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/keys',
      headers: adminHeaders,
      payload: { name: 'delete-test', expiresAt: FUTURE_DATE },
    });
    const { id } = createRes.json();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/keys/${id}`,
      headers: adminHeadersNoBody,
    });
    expect(res.statusCode).toBe(204);

    // Verify it's gone
    const listRes = await app.inject({ method: 'GET', url: '/api/keys', headers: adminHeadersNoBody });
    expect(listRes.json().find((k: { id: string }) => k.id === id)).toBeUndefined();
  });

  it('returns 404 for unknown id', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/keys/nonexistent',
      headers: adminHeadersNoBody,
    });
    expect(res.statusCode).toBe(404);
  });
});
