export type AIProviderId = 'anthropic' | 'openai' | 'codex' | 'mock';

export type AIModel = string;

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  defaultModel: AIModel;
  models: AIModel[];
  supportsStructuredOutput: boolean;
}

export interface AIProviderConfig {
  id: AIProviderId;
  enabled: boolean;
  apiKeyPresent: boolean;
  defaultModel: AIModel;
  maxTokens: number;
  temperature: number;
  localOnly: boolean;
}

export interface AICallTrace {
  providerId: AIProviderId;
  model: AIModel;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  redactionsApplied: number;
}

export interface ProjectAnalysisInput {
  project: {
    id: string;
    name: string;
    localPath: string;
    description: string | null;
    primaryStack: string | null;
  };
  scanSummary: string | null;
  detection: {
    projectType: string | null;
    frameworks: string[];
    packageManager: string | null;
    database: string | null;
    auth: string | null;
    deployment: string | null;
  };
  topFiles: Array<{ path: string; type: string; importance: number }>;
  envVarNames: string[];
  warnings: Array<{ code: string; message: string }>;
}

export interface ProjectAnalysisResult {
  summary: string;
  keyDirectories: Array<{ path: string; purpose: string }>;
  notableFiles: Array<{ path: string; reason: string }>;
  risks: string[];
  recommendedNextActions: string[];
  trace: AICallTrace;
}

export interface AITestConnectionResult {
  ok: boolean;
  providerId: AIProviderId;
  model: AIModel;
  message: string;
  durationMs: number;
}
