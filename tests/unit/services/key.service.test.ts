import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeyService } from '../../../src/services/key.service.js';
import { SECRET_KEY, SALT_KEY, FUTURE_DATE, PAST_DATE } from '../../helpers/fixtures.js';

// Mock file I/O
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('[]'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

function makeService() {
  return new KeyService(SECRET_KEY, SALT_KEY);
}

describe('KeyService.createKey', () => {
  it('returns raw key with sk- prefix', async () => {
    const svc = makeService();
    const result = await svc.createKey({ name: 'test', expiresAt: FUTURE_DATE });
    expect(result.key).toMatch(/^sk-/);
  });

  it('stores key hint (last 4 chars)', async () => {
    const svc = makeService();
    const result = await svc.createKey({ name: 'test', expiresAt: FUTURE_DATE });
    expect(result.key.endsWith(result.key.slice(-4))).toBe(true);
  });

  it('uses default rate limit of 60', async () => {
    const svc = makeService();
    const result = await svc.createKey({ name: 'test', expiresAt: FUTURE_DATE });
    expect(result.rateLimit).toBe(60);
  });

  it('uses custom rate limit when provided', async () => {
    const svc = makeService();
    const result = await svc.createKey({ name: 'test', expiresAt: FUTURE_DATE, rateLimit: 10 });
    expect(result.rateLimit).toBe(10);
  });
});

describe('KeyService.listKeys', () => {
  it('returns empty array initially', () => {
    expect(makeService().listKeys()).toEqual([]);
  });

  it('returns key with masked hint after create', async () => {
    const svc = makeService();
    await svc.createKey({ name: 'my-key', expiresAt: FUTURE_DATE });
    const list = svc.listKeys();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('my-key');
    expect(list[0]?.keyHint).toMatch(/^\w{4}$/);
  });
});

describe('KeyService.toggleKey', () => {
  it('toggles isActive to false then back', async () => {
    const svc = makeService();
    const { id } = await svc.createKey({ name: 'k', expiresAt: FUTURE_DATE });
    expect(await svc.toggleKey(id)).toBe(true);
    expect(svc.listKeys()[0]?.isActive).toBe(false);
    expect(await svc.toggleKey(id)).toBe(true);
    expect(svc.listKeys()[0]?.isActive).toBe(true);
  });

  it('returns false for unknown id', async () => {
    expect(await makeService().toggleKey('nonexistent')).toBe(false);
  });
});

describe('KeyService.deleteKey', () => {
  it('removes key from list', async () => {
    const svc = makeService();
    const { id } = await svc.createKey({ name: 'del', expiresAt: FUTURE_DATE });
    expect(await svc.deleteKey(id)).toBe(true);
    expect(svc.listKeys()).toHaveLength(0);
  });

  it('returns false for unknown id', async () => {
    expect(await makeService().deleteKey('nonexistent')).toBe(false);
  });
});

describe('KeyService.validateKey', () => {
  it('returns valid=true and keyId for active non-expired key', async () => {
    const svc = makeService();
    const { key } = await svc.createKey({ name: 'valid', expiresAt: FUTURE_DATE });
    const result = svc.validateKey(key);
    expect(result.valid).toBe(true);
    expect(result.keyId).toBeDefined();
  });

  it('returns valid=false for unknown key', () => {
    const result = makeService().validateKey('sk-unknown');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid API key');
  });

  it('returns valid=false for inactive key', async () => {
    const svc = makeService();
    const { key, id } = await svc.createKey({ name: 'inactive', expiresAt: FUTURE_DATE });
    await svc.toggleKey(id);
    const result = svc.validateKey(key);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('API key is deactivated');
  });

  it('returns valid=false for expired key', async () => {
    const svc = makeService();
    const { key } = await svc.createKey({ name: 'expired', expiresAt: PAST_DATE });
    const result = svc.validateKey(key);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('API key has expired');
  });

  it('returns valid=false with rate_limit error after exceeding limit', async () => {
    const svc = makeService();
    const { key } = await svc.createKey({ name: 'rl', expiresAt: FUTURE_DATE, rateLimit: 2 });
    svc.validateKey(key); // 1
    svc.validateKey(key); // 2
    const result = svc.validateKey(key); // 3 — over limit
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Rate limit');
  });
});
