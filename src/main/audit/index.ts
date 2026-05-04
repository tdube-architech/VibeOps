import { customAlphabet } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import type { Logger } from 'pino';
import type { Scan, AuditFinding, AuditRun, AuditType, Project } from '@shared/types';
import type { AuditsRepo } from './repo';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProviderRegistry } from '@main/ai/registry';
import { checkArchitecture } from './checkers/architecture';
import { checkSecurity } from './checkers/security';
import { checkDependencies } from './checkers/dependency';
import { checkDeployment } from './checkers/deployment';
import { checkVibeCode } from './checkers/vibe-code';
import { runAICompleteness } from './checkers/ai-completeness';
import { makeFinding, type DraftFinding } from './findings';
import { scoreFindings, riskLabel } from './scoring';
import { buildSafePrompt } from './prompts';
import { loadActiveRulePack } from './rule-pack/loader';
import { runRulePack } from './rule-pack/engine';

const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export interface AuditDeps {
  auditsRepo: AuditsRepo;
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  registry: ProviderRegistry;
  logger: Logger;
  appDataRoot: string;
}

export interface RunAuditArgs {
  projectId: string;
  auditType?: AuditType;
  signal?: AbortSignal;
}

export async function runAudit(deps: AuditDeps, args: RunAuditArgs): Promise<AuditRun> {
  const project = deps.projectsService.byId(args.projectId);
  if (!project) throw new Error(`project ${args.projectId} not found`);

  const scan = deps.scansRepo.latestForProject(project.id);
  if (!scan) throw new Error('No completed scan found. Run a scan first.');
  const files = deps.scansRepo.filesByScan(scan.id);
  const envVars = deps.scansRepo.envVarsByScan(scan.id);

  const id = `aud_${newId()}`;
  const startedAt = new Date().toISOString();
  deps.auditsRepo.start({
    id, projectId: project.id, scanId: scan.id,
    auditType: args.auditType ?? 'full', startedAt
  });

  try {
    const readText = (relPath: string): string | null => {
      try {
        const stats = fs.statSync(path.join(project.localPath, relPath));
        if (stats.size > 256 * 1024) return null;
        return fs.readFileSync(path.join(project.localPath, relPath), 'utf8');
      } catch { return null; }
    };
    const hasFile = (relPath: string): boolean => files.some((f) => f.path === relPath);

    const drafts: DraftFinding[] = [];
    drafts.push(...checkArchitecture({ scan, files }));
    drafts.push(...checkSecurity({ scan, files, envVars, readText }));
    drafts.push(...checkDependencies({ scan, files, envVars, readText, hasFile }));
    drafts.push(...checkDeployment({ scan, files, envVars, readText, hasFile }));
    drafts.push(...checkVibeCode({ files, readText }));

    const rulePack = loadActiveRulePack({ appDataRoot: deps.appDataRoot, logger: deps.logger });
    if (rulePack) {
      const ruleResult = runRulePack(rulePack, { scan, files, envVars, readText, hasFile });
      drafts.push(...ruleResult.findings);
      deps.logger.info(
        {
          packId: ruleResult.packId,
          packVersion: ruleResult.packVersion,
          evaluated: ruleResult.rulesEvaluated,
          matched: ruleResult.rulesMatched,
          findings: ruleResult.findings.length
        },
        'rule pack audit complete'
      );
    }

    const staticFindings: AuditFinding[] = drafts.map((d) =>
      makeFinding({ auditRunId: id, projectId: project.id, createdAt: startedAt, ...d })
    );
    deps.auditsRepo.insertFindings(staticFindings as never);

    let aiTrace: { provider: string; model: string } | null = null;
    let recommendedNextAction: string | null = null;
    let topPromptTitle: string | null = null;
    let topPromptType: string | null = null;
    let topPromptGoal: string | null = null;
    let aiFindings: AuditFinding[] = [];

    let provider = null as Awaited<ReturnType<ProviderRegistry['buildActive']>> | null;
    try { provider = deps.registry.buildActive(); } catch { provider = null; }

    if (provider) {
      try {
        const ai = await runAICompleteness({
          provider,
          projectName: project.name,
          scan,
          files,
          staticFindings
        });
        aiFindings = ai.additionalFindings.map((d) =>
          makeFinding({ auditRunId: id, projectId: project.id, createdAt: startedAt, ...d })
        );
        deps.auditsRepo.insertFindings(aiFindings as never);
        recommendedNextAction = ai.recommendedNextAction;
        topPromptTitle = ai.topPromptTitle;
        topPromptType = ai.topPromptType;
        topPromptGoal = ai.topPromptGoal;
        aiTrace = { provider: ai.trace.provider, model: ai.trace.model };
      } catch (e) {
        deps.logger.warn({ err: (e as Error).message }, 'AI completeness checker failed; continuing with static findings');
      }
    }

    const allFindings = [...staticFindings, ...aiFindings];
    const score = scoreFindings(allFindings);
    const risk = riskLabel(score);

    const topFinding = pickTopFinding(allFindings);
    const promptArgs: Parameters<typeof buildSafePrompt>[0] = { project, topFinding };
    if (topPromptTitle) promptArgs.topPromptTitle = topPromptTitle;
    if (topPromptType) promptArgs.topPromptType = topPromptType;
    if (topPromptGoal) promptArgs.topPromptGoal = topPromptGoal;
    const promptResult = buildSafePrompt(promptArgs);
    const promptRow = {
      ...promptResult.prompt,
      auditRunId: id
    };
    deps.auditsRepo.insertPrompt(promptRow as never);

    const summary = buildAuditSummary({ project, scan, score, risk, allFindings, recommendedNextAction });

    deps.auditsRepo.complete({
      id,
      status: 'completed',
      score,
      riskLevel: risk,
      summary,
      recommendedNextAction,
      generatedPromptId: promptRow.id,
      provider: aiTrace?.provider ?? null,
      model: aiTrace?.model ?? null,
      completedAt: new Date().toISOString()
    });

    deps.projectsService.markAudited(project.id);

    const result = deps.auditsRepo.byId(id);
    if (!result) throw new Error('audit vanished after completion');
    deps.logger.info({ auditId: id, score, risk, findings: allFindings.length }, 'audit completed');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.auditsRepo.complete({
      id, status: 'failed',
      score: null, riskLevel: null, summary: null,
      recommendedNextAction: null, generatedPromptId: null,
      provider: null, model: null,
      completedAt: new Date().toISOString(),
      errorMessage: message
    });
    deps.logger.error({ auditId: id, err: message }, 'audit failed');
    throw err;
  }
}

function pickTopFinding(findings: AuditFinding[]): AuditFinding | null {
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity])[0] ?? null;
}

interface SummaryArgs {
  project: Project;
  scan: Scan;
  score: number;
  risk: string;
  allFindings: AuditFinding[];
  recommendedNextAction: string | null;
}

function buildAuditSummary(args: SummaryArgs): string {
  const counts: Record<string, number> = {};
  for (const f of args.allFindings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  const sevSummary = ['critical', 'high', 'medium', 'low', 'info']
    .map((s) => counts[s] ? `${counts[s]} ${s}` : null)
    .filter(Boolean).join(', ') || 'no findings';
  const next = args.recommendedNextAction ? ` Recommended next action: ${args.recommendedNextAction}` : '';
  return `${args.project.name}: ${args.risk} (score ${args.score}/100). ${sevSummary}.${next}`;
}
