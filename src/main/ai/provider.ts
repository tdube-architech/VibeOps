import type {
  AIProviderId, AIModel, AIProviderInfo, AICallTrace,
  ProjectAnalysisInput, ProjectAnalysisResult, AITestConnectionResult
} from '@shared/ai';

export interface AIProvider {
  info(): AIProviderInfo;
  testConnection(args: { model?: AIModel; signal?: AbortSignal }): Promise<AITestConnectionResult>;
  analyzeProject(input: ProjectAnalysisInput, opts: { model?: AIModel; maxTokens?: number; temperature?: number; signal?: AbortSignal }): Promise<ProjectAnalysisResult>;
}

export interface ProviderFactory {
  id: AIProviderId;
  build(args: {
    apiKey: string | null;
    defaultModel: AIModel;
    fetchImpl?: typeof fetch;
  }): AIProvider;
}

export function startTrace() {
  const t0 = Date.now();
  return (extra: Partial<AICallTrace>): AICallTrace => ({
    providerId: extra.providerId ?? 'mock',
    model: extra.model ?? 'mock',
    inputTokens: extra.inputTokens ?? null,
    outputTokens: extra.outputTokens ?? null,
    durationMs: Date.now() - t0,
    redactionsApplied: extra.redactionsApplied ?? 0
  });
}
