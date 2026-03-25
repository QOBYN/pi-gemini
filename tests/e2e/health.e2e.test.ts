import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/build-app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await buildApp());
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
