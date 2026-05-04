import type { AIProvider, ProviderFactory } from '@main/ai/provider';
import { startTrace } from '@main/ai/provider';
import type { AITestConnectionResult, ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';

export const mockProviderFactory: ProviderFactory = {
  id: 'mock',
  build(): AIProvider {
    return {
      info: () => ({
        id: 'mock', name: 'Mock', defaultModel: 'mock',
        models: ['mock'], supportsStructuredOutput: true
      }),
      async testConnection(): Promise<AITestConnectionResult> {
        return { ok: true, providerId: 'mock', model: 'mock', message: 'mock provider connected', durationMs: 1 };
      },
      async analyzeProject(input: ProjectAnalysisInput): Promise<ProjectAnalysisResult> {
        const trace = startTrace();
        const stack = input.detection.frameworks.join(', ') || 'unknown';
        return {
          summary: `Mock analysis of ${input.project.name}. Stack: ${stack}.`,
          keyDirectories: [{ path: 'src', purpose: 'application source' }],
          notableFiles: input.topFiles.slice(0, 3).map((f) => ({ path: f.path, reason: 'high importance score' })),
          risks: input.warnings.map((w) => `${w.code}: ${w.message}`),
          recommendedNextActions: ['Run a deeper audit (Phase 5).'],
          trace: trace({ providerId: 'mock', model: 'mock' })
        };
      }
    };
  }
};
