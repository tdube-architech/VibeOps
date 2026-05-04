import Anthropic from '@anthropic-ai/sdk';
import { startTrace, type AIProvider, type ProviderFactory } from '@main/ai/provider';
import type { AITestConnectionResult, ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';
import { redactSecrets } from '@main/ai/redactor';
import { buildProjectSummaryUserPrompt, PROJECT_SUMMARY_SYSTEM } from '@main/ai/operations/prompt-templates';

const KNOWN_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001'
];

export const anthropicProviderFactory: ProviderFactory = {
  id: 'anthropic',
  build({ apiKey, defaultModel }) {
    function client() {
      if (!apiKey) throw new Error('Anthropic API key not configured.');
      return new Anthropic({ apiKey });
    }

    const provider: AIProvider = {
      info: () => ({
        id: 'anthropic', name: 'Anthropic',
        defaultModel: defaultModel || 'claude-sonnet-4-6',
        models: KNOWN_MODELS, supportsStructuredOutput: true
      }),

      async testConnection({ model, signal }): Promise<AITestConnectionResult> {
        const t0 = Date.now();
        try {
          const c = client();
          const resp = await c.messages.create({
            model: model ?? defaultModel,
            max_tokens: 64,
            messages: [{ role: 'user', content: 'Reply with the single word: pong' }]
          }, { signal });
          const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
          return {
            ok: text.toLowerCase().includes('pong'),
            providerId: 'anthropic',
            model: resp.model,
            message: text.trim() || 'no text returned',
            durationMs: Date.now() - t0
          };
        } catch (err) {
          return {
            ok: false, providerId: 'anthropic', model: model ?? defaultModel,
            message: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - t0
          };
        }
      },

      async analyzeProject(input: ProjectAnalysisInput, opts): Promise<ProjectAnalysisResult> {
        const trace = startTrace();
        const c = client();
        const userPromptRaw = buildProjectSummaryUserPrompt(input);
        const redacted = redactSecrets(userPromptRaw);

        const resp = await c.messages.create({
          model: opts.model ?? defaultModel,
          max_tokens: opts.maxTokens ?? 1500,
          temperature: opts.temperature ?? 0.2,
          system: PROJECT_SUMMARY_SYSTEM,
          messages: [{ role: 'user', content: redacted.text }]
        }, { signal: opts.signal });

        const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
        const parsed = parseStructured(text);

        return {
          summary: parsed.summary,
          keyDirectories: parsed.keyDirectories,
          notableFiles: parsed.notableFiles,
          risks: parsed.risks,
          recommendedNextActions: parsed.recommendedNextActions,
          trace: trace({
            providerId: 'anthropic',
            model: resp.model,
            inputTokens: resp.usage.input_tokens,
            outputTokens: resp.usage.output_tokens,
            redactionsApplied: redacted.replaced
          })
        };
      }
    };

    return provider;
  }
};

interface ParsedAnalysis {
  summary: string;
  keyDirectories: Array<{ path: string; purpose: string }>;
  notableFiles: Array<{ path: string; reason: string }>;
  risks: string[];
  recommendedNextActions: string[];
}

function parseStructured(text: string): ParsedAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const obj = JSON.parse(cleaned);
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : 'No summary returned.',
      keyDirectories: Array.isArray(obj.keyDirectories) ? obj.keyDirectories.filter(isPathPurpose) : [],
      notableFiles: Array.isArray(obj.notableFiles) ? obj.notableFiles.filter(isPathReason) : [],
      risks: Array.isArray(obj.risks) ? obj.risks.filter((r: unknown) => typeof r === 'string') : [],
      recommendedNextActions: Array.isArray(obj.recommendedNextActions)
        ? obj.recommendedNextActions.filter((r: unknown) => typeof r === 'string')
        : []
    };
  } catch {
    return {
      summary: cleaned.slice(0, 1000),
      keyDirectories: [],
      notableFiles: [],
      risks: [],
      recommendedNextActions: []
    };
  }
}

function isPathPurpose(v: unknown): v is { path: string; purpose: string } {
  return !!v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string' && typeof (v as { purpose?: unknown }).purpose === 'string';
}

function isPathReason(v: unknown): v is { path: string; reason: string } {
  return !!v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string' && typeof (v as { reason?: unknown }).reason === 'string';
}
