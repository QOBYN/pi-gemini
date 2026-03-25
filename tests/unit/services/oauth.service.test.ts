import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OAuthService } from '../../../src/services/oauth.service.js';
import { MOCK_OAUTH_CREDENTIALS } from '../../helpers/fixtures.js';

const AUTH_FILE = '/tmp/test-auth.json';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

import { readFile, writeFile } from 'node:fs/promises';
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

function makeService() {
  return new OAuthService(AUTH_FILE);
}

async function makeAuthenticatedService(overrides: Partial<typeof MOCK_OAUTH_CREDENTIALS['google-gemini-cli']> = {}) {
  mockReadFile.mockResolvedValueOnce(
    JSON.stringify({ 'google-gemini-cli': { ...MOCK_OAUTH_CREDENTIALS['google-gemini-cli'], ...overrides } }) as unknown as Buffer,
  );
  const svc = makeService();
  await svc.init();
  return svc;
}

describe('OAuthService.init', () => {
  it('loads credentials from file', async () => {
    const svc = await makeAuthenticatedService();
    expect(svc.isAuthenticated()).toBe(true);
  });

  it('succeeds silently when file does not exist', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await expect(svc.init()).resolves.not.toThrow();
    expect(svc.isAuthenticated()).toBe(false);
  });
});

describe('OAuthService.getTokenStatus', () => {
  it('returns authenticated=false when not logged in', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    expect(svc.getTokenStatus().authenticated).toBe(false);
  });

  it('returns email and expiry when authenticated', async () => {
    const svc = await makeAuthenticatedService();
    const status = svc.getTokenStatus();
    expect(status.authenticated).toBe(true);
    expect(status.email).toBe('test@example.com');
    expect(status.expiresAt).toBeDefined();
    expect(status.expired).toBe(false);
  });

  it('marks token as expired when past expiry', async () => {
    const svc = await makeAuthenticatedService({ expires: Date.now() - 1000 });
    expect(svc.getTokenStatus().expired).toBe(true);
  });
});

describe('OAuthService.getAccessToken', () => {
  it('returns token when not expired', async () => {
    const svc = await makeAuthenticatedService();
    expect(await svc.getAccessToken()).toBe('mock-access-token');
  });

  it('throws when not authenticated', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    await expect(svc.getAccessToken()).rejects.toThrow('Not authenticated');
  });

  it('refreshes token when expiring within 60s', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'refreshed-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const svc = await makeAuthenticatedService({ expires: Date.now() + 30_000 }); // 30s left
    const token = await svc.getAccessToken();
    expect(token).toBe('refreshed-token');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' }),
    );
    fetchSpy.mockRestore();
  });

  it('clears credentials and throws when refresh fails', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('invalid_grant', { status: 400 }),
    );
    const svc = await makeAuthenticatedService({ expires: Date.now() + 30_000 });
    await expect(svc.getAccessToken()).rejects.toThrow('OAuth refresh failed');
    expect(svc.isAuthenticated()).toBe(false);
    fetchSpy.mockRestore();
  });
});

describe('OAuthService.startOAuthFlow', () => {
  it('returns a valid Google OAuth URL', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    const url = svc.startOAuthFlow();
    expect(url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=681255809395');
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8085');
  });

  it('pkce session expires after 3 minutes', async () => {
    vi.useFakeTimers();
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    svc.startOAuthFlow();
    vi.advanceTimersByTime(3 * 60 * 1000 + 1);
    await expect(svc.handleCallbackUrl('http://localhost:8085/oauth2callback?code=x&state=y')).rejects.toThrow(/expired/i);
    vi.useRealTimers();
  });
});

describe('OAuthService.handleCallbackUrl', () => {
  it('throws when no active session', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    await expect(svc.handleCallbackUrl('http://localhost:8085/oauth2callback?code=x&state=y')).rejects.toThrow('No active OAuth session');
  });

  it('throws on invalid URL', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    svc.startOAuthFlow();
    await expect(svc.handleCallbackUrl('not-a-url')).rejects.toThrow('Invalid URL');
  });

  it('throws on OAuth error param', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    svc.startOAuthFlow();
    await expect(svc.handleCallbackUrl('http://localhost:8085/oauth2callback?error=access_denied')).rejects.toThrow('access_denied');
  });

  it('throws on invalid state', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    svc.startOAuthFlow();
    await expect(svc.handleCallbackUrl('http://localhost:8085/oauth2callback?code=x&state=wrong')).rejects.toThrow('Invalid OAuth state');
  });

  it('exchanges code for tokens on happy path', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    mockReadFile.mockRejectedValueOnce(new Error('ENOENT'));
    const svc = makeService();
    await svc.init();
    const url = svc.startOAuthFlow();
    const state = new URL(url).searchParams.get('state')!;
    await svc.handleCallbackUrl(`http://localhost:8085/oauth2callback?code=auth-code&state=${state}`);
    expect(svc.isAuthenticated()).toBe(true);
    expect(mockWriteFile).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
