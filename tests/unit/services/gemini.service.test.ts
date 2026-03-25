import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService } from '../../../src/services/gemini.service.js';
import type { OAuthService } from '../../../src/services/oauth.service.js';
import type { UsageService } from '../../../src/services/usage.service.js';
import { MOCK_GEMINI_RESPONSE, MOCK_GEMINI_REQUEST } from '../../helpers/fixtures.js';

function makeOAuthMock(token = 'mock-token', projectId = 'test-project'): OAuthService {
  return {
    getAccessToken: vi.fn().mockResolvedValue(token),
    getProjectId: vi.fn().mockReturnValue(projectId),
  } as unknown as OAuthService;
}

function makeUsageMock(): UsageService {
  return { record: vi.fn(), getStats: vi.fn() } as unknown as UsageService;
}

describe('GeminiService.generateContent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('calls correct Code Assist endpoint with Bearer token', async () => {
    const chunk = JSON.stringify(MOCK_GEMINI_RESPONSE);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(`data: ${chunk}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const svc = new GeminiService(makeOAuthMock(), 'gemini-2.0-flash', makeUsageMock());
    await svc.generateContent('gemini-2.0-flash', MOCK_GEMINI_REQUEST);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain('cloudcode-pa.googleapis.com/v1internal:streamGenerateContent');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer mock-token');
  });

  it('returns parsed response', async () => {
    const chunk = JSON.stringify(MOCK_GEMINI_RESPONSE);
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(`data: ${chunk}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const svc = new GeminiService(makeOAuthMock(), 'gemini-2.0-flash', makeUsageMock());
    const result = await svc.generateContent('gemini-2.0-flash', MOCK_GEMINI_REQUEST);
    expect(result.candidates[0]?.content.parts[0]?.text).toBe('Hello!');
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Quota exceeded', { status: 429 }),
    );
    const svc = new GeminiService(makeOAuthMock(), 'gemini-2.0-flash', makeUsageMock());
    await expect(svc.generateContent('gemini-2.0-flash', MOCK_GEMINI_REQUEST)).rejects.toThrow('Gemini API error: 429');
  });
});

describe('GeminiService.streamGenerateContent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('yields SSE chunks and terminates with [DONE]', async () => {
    const sseBody = `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hi' }] }, index: 0 }] })}\n\n`;
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(sseBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    const svc = new GeminiService(makeOAuthMock(), 'gemini-2.0-flash', makeUsageMock());
    const chunks: string[] = [];
    for await (const chunk of svc.streamGenerateContent('gemini-2.0-flash', MOCK_GEMINI_REQUEST)) {
      chunks.push(chunk);
    }
    expect(chunks.some(c => c.includes('"text":"Hi"'))).toBe(true);
    expect(chunks[chunks.length - 1]).toBe('data: [DONE]\n\n');
  });

  it('throws on non-200 response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    const svc = new GeminiService(makeOAuthMock(), 'gemini-2.0-flash', makeUsageMock());
    const gen = svc.streamGenerateContent('gemini-2.0-flash', MOCK_GEMINI_REQUEST);
    await expect(gen.next()).rejects.toThrow('Gemini API error: 401');
  });
});
