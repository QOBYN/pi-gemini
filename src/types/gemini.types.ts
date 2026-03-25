// Gemini API native types — mirrors https://ai.google.dev/api/rest

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

export interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  }>;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseMimeType?: string;
}

export interface GeminiSafetySettings {
  category: string;
  threshold: string;
}

export interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  systemInstruction?: GeminiContent;
  generationConfig?: GeminiGenerationConfig;
  safetySettings?: GeminiSafetySettings[];
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  index?: number;
  safetyRatings?: Array<{ category: string; probability: string }>;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

export interface GeminiModelInfo {
  name: string;
  baseModelId?: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

export interface GeminiListModelsResponse {
  models: GeminiModelInfo[];
  nextPageToken?: string;
}
