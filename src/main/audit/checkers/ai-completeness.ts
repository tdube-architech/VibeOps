import type { AIProvider } from '@main/ai/provider';
import type { Scan, ScanFile, AuditFinding } from '@shared/types';
import type { DraftFinding } from '../findings';
import { AI_AUDIT_SYSTEM, buildAuditUserPrompt } from '../ai-prompt-templates';
import { redactSecrets } from '@main/ai/redactor';

export interface AICompletenessInput {
  provider: AIProvider;
  projectName: string;
  scan: Scan;
  files: ScanFile[];
  staticFindings: AuditFinding[];
  signal?: AbortSignal;
}

export interface AICompletenessResult {
  additionalFindings: DraftFinding[];
  recommendedNextAction: string | null;
  topPromptTitle: string | null;
  topPromptType: string | null;
  topPromptGoal: string | null;
  trace: { provider: string; model: string; durationMs: number; redactionsApplied: number; inputTokens: number | null; outputTokens: number | null };
}

interface RawAdditional {
  severity: AuditFinding['severity'];
  category: 'product-completeness' | 'vibe-code-quality';
  title: string;
  description: string;
  filePath: string | null;
  recommendation: string;
}

interface RawAIResponse {
  additionalFindings: RawAdditional[];
  recommendedNextAction: string;
  topPromptTitle: string;
  topPromptType: string;
  topPromptGoal: string;
}

const VALID_SEV = new Set<AuditFinding['severity']>(['critical', 'high', 'medium', 'low', 'info']);
const VALID_CAT = new Set<RawAdditional['category']>(['product-completeness', 'vibe-code-quality']);

function parse(text: string): RawAIResponse | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(cleaned) as RawAIResponse; } catch { return null; }
}

export async function runAICompleteness(input: AICompletenessInput): Promise<AICompletenessResult> {
  const userPromptRaw = buildAuditUserPrompt({
    projectName: input.projectName,
    scanSummary: input.scan.summary,
    detection: input.scan.detection,
    topFiles: [...input.files].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 25)
      .map((f) => ({ path: f.path, fileType: f.fileType, importanceScore: f.importanceScore })),
    staticFindings: input.staticFindings,
    warnings: input.scan.warnings
  });
  const redacted = redactSecrets(userPromptRaw);

  const completeArgs: { system: string; user: string; signal?: AbortSignal } = {
    system: AI_AUDIT_SYSTEM,
    user: redacted.text
  };
  if (input.signal) completeArgs.signal = input.signal;
  const resp = await input.provider.complete(completeArgs);

  const parsed = parse(resp.text);
  const additionalFindings: DraftFinding[] = [];
  if (parsed) {
    for (const f of parsed.additionalFindings ?? []) {
      if (!VALID_SEV.has(f.severity) || !VALID_CAT.has(f.category)) continue;
      if (typeof f.title !== 'string' || f.title.length === 0) continue;
      const draft: DraftFinding = {
        severity: f.severity,
        category: f.category,
        title: f.title.slice(0, 200)
      };
      if (typeof f.description === 'string') draft.description = f.description.slice(0, 2000);
      if (typeof f.filePath === 'string') draft.filePath = f.filePath;
      if (typeof f.recommendation === 'string') draft.recommendation = f.recommendation.slice(0, 1000);
      additionalFindings.push(draft);
    }
  }

  return {
    additionalFindings,
    recommendedNextAction: parsed?.recommendedNextAction ?? null,
    topPromptTitle: parsed?.topPromptTitle ?? null,
    topPromptType: parsed?.topPromptType ?? null,
    topPromptGoal: parsed?.topPromptGoal ?? null,
    trace: {
      provider: input.provider.info().id,
      model: resp.model,
      durationMs: resp.durationMs,
      redactionsApplied: redacted.replaced,
      inputTokens: resp.inputTokens,
      outputTokens: resp.outputTokens
    }
  };
}
