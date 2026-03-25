import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from '../../../src/lib/crypto.js';

const SECRET = 'test-secret';
const SALT = 'test-salt';

describe('generateApiKey', () => {
  it('returns string starting with sk-', () => {
    expect(generateApiKey(SECRET)).toMatch(/^sk-[a-f0-9]{64}$/);
  });

  it('returns different keys on each call', () => {
    expect(generateApiKey(SECRET)).not.toBe(generateApiKey(SECRET));
  });
});

describe('hashApiKey', () => {
  it('returns consistent hex hash for same inputs', () => {
    const key = 'sk-abc123';
    expect(hashApiKey(key, SALT)).toBe(hashApiKey(key, SALT));
  });

  it('returns different hash for different salt', () => {
    const key = 'sk-abc123';
    expect(hashApiKey(key, SALT)).not.toBe(hashApiKey(key, 'other-salt'));
  });

  it('returns hex string of expected length (sha256 = 64 chars)', () => {
    expect(hashApiKey('sk-abc', SALT)).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('verifyApiKey', () => {
  it('returns true for correct key', () => {
    const key = generateApiKey(SECRET);
    const hash = hashApiKey(key, SALT);
    expect(verifyApiKey(key, hash, SALT)).toBe(true);
  });

  it('returns false for wrong key', () => {
    const key = generateApiKey(SECRET);
    const hash = hashApiKey(key, SALT);
    expect(verifyApiKey('sk-wrongkey', hash, SALT)).toBe(false);
  });

  it('returns false for wrong salt', () => {
    const key = generateApiKey(SECRET);
    const hash = hashApiKey(key, SALT);
    expect(verifyApiKey(key, hash, 'wrong-salt')).toBe(false);
  });

  it('returns false when hash length mismatches', () => {
    expect(verifyApiKey('sk-abc', 'tooshort', SALT)).toBe(false);
  });
});
