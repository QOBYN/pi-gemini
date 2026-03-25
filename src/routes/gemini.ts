import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { GeminiService } from '../services/gemini.service.js';
import type { GeminiGenerateContentRequest } from '../types/gemini.types.js';

function parseModelRoute(url: string): { modelId: string; action: string } | null {
  // Matches /v1beta/models/<modelId>:<action>[?query]
  const match = /\/v1beta\/models\/([^/:?]+):([^/?]+)/.exec(url);
  if (!match) return null;
  return { modelId: match[1] ?? '', action: match[2] ?? '' };
}

export function registerGeminiRoutes(
  app: FastifyInstance,
  geminiService: GeminiService,
  authHook: preHandlerHookHandler,
): void {
  // List models
  app.get('/v1beta/models', async (_request, reply) => {
    return reply.send({
      models: [
        { name: 'models/gemini-3.1-pro-preview', displayName: 'Gemini 3.1 Pro Preview', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        { name: 'models/gemini-3-pro-preview', displayName: 'Gemini 3 Pro Preview', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        { name: 'models/gemini-3-flash-preview', displayName: 'Gemini 3 Flash Preview', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
        { name: 'models/gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', supportedGenerationMethods: ['generateContent', 'streamGenerateContent'] },
      ],
    });
  });

  // Get single model — e.g. GET /v1beta/models/gemini-2.0-flash
  app.get<{ Params: { model: string } }>(
    '/v1beta/models/:model',
    async (request, reply) => {
      const modelId = request.params.model;
      return reply.send({
        name: `models/${modelId}`,
        displayName: modelId,
        supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
      });
    },
  );

  // Wildcard POST handler for /v1beta/models/<model>:<action>
  // Handles both :generateContent and :streamGenerateContent
  app.post<{ Body: GeminiGenerateContentRequest }>(
    '/v1beta/models/*',
    {
      preHandler: [authHook],
      schema: {
        body: {
          type: 'object',
          required: ['contents'],
          additionalProperties: true,
          properties: {
            contents: { type: 'array' },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = parseModelRoute(request.url);

      if (!parsed) {
        return reply.status(404).send({ error: { message: 'Unknown route', status: 404 } });
      }

      const { modelId, action } = parsed;

      if (action === 'generateContent') {
        const result = await geminiService.generateContent(modelId, request.body);
        return reply.send(result);
      }

      if (action === 'streamGenerateContent') {
        reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        try {
          for await (const chunk of geminiService.streamGenerateContent(modelId, request.body)) {
            reply.raw.write(chunk);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Internal server error';
          reply.raw.write(`data: ${JSON.stringify({ error: { message: errMsg, type: 'server_error', code: 'internal_error' } })}\n\n`);
        } finally {
          reply.raw.end();
        }

        return reply;
      }

      return reply.status(404).send({ error: { message: `Unknown action: ${action}`, status: 404 } });
    },
  );
}
