import { http, HttpResponse } from 'msw';
import { MOCK_GEMINI_RESPONSE } from './fixtures.js';

export const googleOAuthTokenHandler = http.post(
  'https://oauth2.googleapis.com/token',
  () => {
    return HttpResponse.json({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
  },
);

export const loadCodeAssistHandler = http.post(
  'https://cloudcode-pa.googleapis.com/v1internal\\:loadCodeAssist',
  () => HttpResponse.json({ cloudaicompanionProject: { id: 'test-project' } }),
);

const chunk1 = () => JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hello' }] }, index: 0 }] });
const chunk2 = () => JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [{ text: '!' }] }, finishReason: 'STOP', index: 0 }],
  usageMetadata: MOCK_GEMINI_RESPONSE.usageMetadata,
});

// generateContent (no ?alt=sse): returns SSE-formatted text/plain so resp.text() works
export const codeAssistGenerateHandler = http.post(
  'https://cloudcode-pa.googleapis.com/v1internal\\:streamGenerateContent',
  ({ request }) => {
    const url = new URL(request.url);
    const isSSE = url.searchParams.get('alt') === 'sse';
    const body = `data: ${chunk1()}\n\ndata: ${chunk2()}\n\n`;
    // Use text/plain for non-SSE (generateContent) so resp.text() works in tests
    // Use text/event-stream for SSE (streamGenerateContent) for streaming reads
    return new HttpResponse(body, {
      headers: { 'Content-Type': isSSE ? 'text/event-stream' : 'text/plain' },
    });
  },
);

export const defaultHandlers = [
  googleOAuthTokenHandler,
  loadCodeAssistHandler,
  codeAssistGenerateHandler,
];
