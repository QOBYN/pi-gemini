import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware } from '../../../src/middleware/auth.js';
import type { KeyService } from '../../../src/services/key.service.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

function makeKeyServiceMock(result: { valid: boolean; error?: string; keyId?: string }): KeyService {
  return { validateKey: vi.fn().mockReturnValue(result) } as unknown as KeyService;
}

function makeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

function makeReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply as unknown as FastifyReply;
}

describe('createAuthMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const svc = makeKeyServiceMock({ valid: true });
    const hook = createAuthMiddleware(svc);
    const request = makeRequest({});
    const reply = makeReply();
    await hook(request, reply);
    expect((reply.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(401);
  });

  it('returns 401 for invalid key', async () => {
    const svc = makeKeyServiceMock({ valid: false, error: 'Invalid API key' });
    const hook = createAuthMiddleware(svc);
    const request = makeRequest({ authorization: 'Bearer sk-bad' });
    const reply = makeReply();
    await hook(request, reply);
    expect((reply.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(401);
  });

  it('returns 429 for rate limit error', async () => {
    const svc = makeKeyServiceMock({ valid: false, error: 'Rate limit exceeded. Try again later.' });
    const hook = createAuthMiddleware(svc);
    const request = makeRequest({ authorization: 'Bearer sk-rl' });
    const reply = makeReply();
    await hook(request, reply);
    expect((reply.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(429);
  });

  it('attaches keyId to request for valid key', async () => {
    const svc = makeKeyServiceMock({ valid: true, keyId: 'key-id-1' });
    const hook = createAuthMiddleware(svc);
    const request = makeRequest({ authorization: 'Bearer sk-valid' }) as FastifyRequest & { keyId?: string };
    const reply = makeReply();
    await hook(request, reply);
    expect(request.keyId).toBe('key-id-1');
  });

  it('accepts x-goog-api-key header as alternative', async () => {
    const svc = makeKeyServiceMock({ valid: true, keyId: 'key-id-2' });
    const hook = createAuthMiddleware(svc);
    const request = makeRequest({ 'x-goog-api-key': 'sk-valid' }) as FastifyRequest & { keyId?: string };
    const reply = makeReply();
    await hook(request, reply);
    expect(request.keyId).toBe('key-id-2');
  });
});
