import type {
  GeminiGenerateContentRequest,
  GeminiGenerateContentResponse,
} from '../types/gemini.types.js';
import type { OAuthService } from './oauth.service.js';
import type { UsageService } from './usage.service.js';

const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_HEADERS = {
  'User-Agent': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'X-Goog-Api-Client': 'gl-node/22.17.0',
  'Client-Metadata': JSON.stringify({ ideType: 'IDE_UNSPECIFIED', pluginType: 'GEMINI' }),
};

function buildCodeAssistBody(modelId: string, projectId: string, request: GeminiGenerateContentRequest) {
  return {
    project: projectId,
    model: modelId,
    request,
    userAgent: 'pi-coding-agent',
    requestId: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
  };
}

export class GeminiService {
  constructor(
    private readonly oauthService: OAuthService,
    readonly defaultModel: string,
    private readonly usageService: UsageService,
  ) {}

  async generateContent(
    modelId: string,
    request: GeminiGenerateContentRequest,
  ): Promise<GeminiGenerateContentResponse> {
    const token = await this.oauthService.getAccessToken();
    const projectId = this.oauthService.getProjectId();
    const url = `${CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent`;

    const body = buildCodeAssistBody(modelId, projectId, request);
    process.stdout.write(`[gemini] generateContent url=${url} body=${JSON.stringify(body)}\n`);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...CODE_ASSIST_HEADERS,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Gemini API error: ${resp.status} ${errBody}`);
    }

    // cloudcode-pa returns either SSE (data: lines) or JSON array ([{response: ...}])
    const text = await resp.text();
    process.stdout.write(`[gemini] raw response (first 500): ${text.slice(0, 500)}\n`);

    // Try JSON array format first: [{response: {candidates: [...]}}]
    let chunks: GeminiGenerateContentResponse[] = [];
    try {
      const parsed = JSON.parse(text) as Array<{ response?: GeminiGenerateContentResponse }>;
      if (Array.isArray(parsed)) {
        chunks = parsed.map(item => item.response ?? item as unknown as GeminiGenerateContentResponse).filter(Boolean);
      }
    } catch {
      // Fall back to SSE format: data: {...}\n\n
      chunks = text
        .split('\n')
        .filter(line => line.startsWith('data: ') && line.slice(6).trim() !== '[DONE]')
        .map(line => { try { return JSON.parse(line.slice(6)) as GeminiGenerateContentResponse; } catch { return null; } })
        .filter((c): c is GeminiGenerateContentResponse => c !== null);
    }

    if (chunks.length === 0) {
      throw new Error('Empty response from Gemini API');
    }

    const allText = chunks
      .flatMap(c => c.candidates ?? [])
      .flatMap(c => c.content?.parts ?? [])
      .map(p => p.text ?? '')
      .join('');

    const last = chunks[chunks.length - 1]!;

    // Record usage if available
    const meta = last.usageMetadata;
    if (typeof meta?.promptTokenCount === 'number' && typeof meta?.candidatesTokenCount === 'number') {
      this.usageService.record(meta.promptTokenCount, meta.candidatesTokenCount);
    }

    return {
      candidates: [{
        content: { role: 'model', parts: [{ text: allText }] },
        finishReason: last.candidates?.[0]?.finishReason,
        index: 0,
      }],
      usageMetadata: last.usageMetadata,
    };
  }

  async *streamGenerateContent(
    modelId: string,
    request: GeminiGenerateContentRequest,
  ): AsyncGenerator<string> {
    const token = await this.oauthService.getAccessToken();
    const projectId = this.oauthService.getProjectId();
    const url = `${CODE_ASSIST_ENDPOINT}/v1internal:streamGenerateContent?alt=sse`;

    const body = buildCodeAssistBody(modelId, projectId, request);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...CODE_ASSIST_HEADERS,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      throw new Error(`Gemini API error: ${resp.status} ${errBody}`);
    }

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastUsageMeta: { promptTokenCount?: number; candidatesTokenCount?: number } | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            // Record usage before final DONE yield
            if (lastUsageMeta &&
                typeof lastUsageMeta.promptTokenCount === 'number' &&
                typeof lastUsageMeta.candidatesTokenCount === 'number') {
              this.usageService.record(lastUsageMeta.promptTokenCount, lastUsageMeta.candidatesTokenCount);
            }
            yield 'data: [DONE]\n\n';
            return;
          }
          // Try to extract usageMetadata from each chunk
          try {
            const chunk = JSON.parse(data) as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
            if (chunk.usageMetadata) lastUsageMeta = chunk.usageMetadata;
          } catch { /* ignore parse errors */ }
          yield `data: ${data}\n\n`;
        }
      }
    }

    // Final flush if [DONE] was never received
    if (lastUsageMeta &&
        typeof lastUsageMeta.promptTokenCount === 'number' &&
        typeof lastUsageMeta.candidatesTokenCount === 'number') {
      this.usageService.record(lastUsageMeta.promptTokenCount, lastUsageMeta.candidatesTokenCount);
    }
    yield 'data: [DONE]\n\n';
  }
}
