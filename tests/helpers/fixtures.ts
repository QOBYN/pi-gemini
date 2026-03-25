import type { ApiKeyRecord } from '../../src/types/key.types.js';

export const SECRET_KEY = 'test-secret-key';
export const SALT_KEY = 'test-salt-key';
export const ADMIN_KEY = 'test-admin-key';
export const DEFAULT_MODEL = 'gemini-2.0-flash';
export const AUTH_FILE = '/tmp/test-auth-nonexistent-12345.json';

export const FUTURE_DATE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
export const PAST_DATE = new Date(Date.now() - 1000).toISOString();

export function makeKeyRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 'test-id-1',
    hashedKey: 'abc123',
    keyHint: 'abcd',
    name: 'test-key',
    createdAt: new Date().toISOString(),
    expiresAt: FUTURE_DATE,
    rateLimit: 60,
    isActive: true,
    ...overrides,
  };
}

export const MOCK_OAUTH_CREDENTIALS = {
  'google-gemini-cli': {
    type: 'oauth' as const,
    refresh: 'mock-refresh-token',
    access: 'mock-access-token',
    expires: Date.now() + 3600 * 1000,
    projectId: 'test-project',
    email: 'test@example.com',
  },
};

export const MOCK_GEMINI_RESPONSE = {
  candidates: [
    {
      content: { role: 'model', parts: [{ text: 'Hello!' }] },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
};

export const MOCK_GEMINI_REQUEST = {
  contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
};
