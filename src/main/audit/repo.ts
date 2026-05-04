import { desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { auditRuns, auditFindings, generatedPrompts, type AuditRunRow, type AuditFindingRow, type GeneratedPromptRow } from '@main/db/schema';
import type { AuditRun, AuditFinding, GeneratedPrompt, AuditStatus, RiskLevel, AuditType } from '@shared/types';

function rowToFinding(row: AuditFindingRow): AuditFinding {
  return {
    id: row.id,
    auditRunId: row.auditRunId,
    projectId: row.projectId,
    severity: row.severity as AuditFinding['severity'],
    category: row.category as AuditFinding['category'],
    title: row.title,
    description: row.description,
    filePath: row.filePath,
    lineStart: row.lineStart,
    lineEnd: row.lineEnd,
    recommendation: row.recommendation,
    suggestedPrompt: row.suggestedPrompt,
    status: row.status as AuditFinding['status'],
    createdAt: row.createdAt
  };
}

function rowToRun(row: AuditRunRow, findings: AuditFinding[]): AuditRun {
  return {
    id: row.id,
    projectId: row.projectId,
    scanId: row.scanId,
    auditType: row.auditType as AuditType,
    provider: row.provider,
    model: row.model,
    status: row.status as AuditStatus,
    score: row.score,
    riskLevel: (row.riskLevel as RiskLevel | null) ?? null,
    summary: row.summary,
    recommendedNextAction: row.recommendedNextAction,
    generatedPromptId: row.generatedPromptId,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage,
    findings
  };
}

function rowToPrompt(row: GeneratedPromptRow): GeneratedPrompt {
  return {
    id: row.id,
    projectId: row.projectId,
    auditRunId: row.auditRunId,
    title: row.title,
    promptType: row.promptType,
    content: row.content,
    status: row.status as GeneratedPrompt['status'],
    outcomeNotes: row.outcomeNotes,
    createdAt: row.createdAt,
    usedAt: row.usedAt
  };
}

export interface StartAuditArgs {
  id: string;
  projectId: string;
  scanId: string | null;
  auditType: AuditType;
  startedAt: string;
}

export interface CompleteAuditArgs {
  id: string;
  status: AuditStatus;
  score: number | null;
  riskLevel: RiskLevel | null;
  summary: string | null;
  recommendedNextAction: string | null;
  generatedPromptId: string | null;
  provider: string | null;
  model: string | null;
  completedAt: string;
  errorMessage?: string | null;
}

export class AuditsRepo {
  constructor(private readonly db: Db) {}

  start(args: StartAuditArgs): void {
    this.db.insert(auditRuns).values({
      id: args.id,
      projectId: args.projectId,
      scanId: args.scanId,
      auditType: args.auditType,
      provider: null,
      model: null,
      status: 'running',
      score: null,
      riskLevel: null,
      summary: null,
      recommendedNextAction: null,
      generatedPromptId: null,
      startedAt: args.startedAt,
      completedAt: null,
      errorMessage: null
    }).run();
  }

  complete(args: CompleteAuditArgs): void {
    this.db.update(auditRuns).set({
      status: args.status,
      score: args.score,
      riskLevel: args.riskLevel,
      summary: args.summary,
      recommendedNextAction: args.recommendedNextAction,
      generatedPromptId: args.generatedPromptId,
      provider: args.provider,
      model: args.model,
      completedAt: args.completedAt,
      errorMessage: args.errorMessage ?? null
    }).where(eq(auditRuns.id, args.id)).run();
  }

  insertFindings(rows: AuditFindingRow[]): void {
    if (rows.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      this.db.insert(auditFindings).values(rows.slice(i, i + chunkSize)).run();
    }
  }

  insertPrompt(prompt: GeneratedPromptRow): void {
    this.db.insert(generatedPrompts).values(prompt).run();
  }

  byId(id: string): AuditRun | null {
    const row = this.db.select().from(auditRuns).where(eq(auditRuns.id, id)).get();
    if (!row) return null;
    const findings = this.findingsByRun(id);
    return rowToRun(row, findings);
  }

  listByProject(projectId: string): AuditRun[] {
    const rows = this.db.select().from(auditRuns).where(eq(auditRuns.projectId, projectId))
      .orderBy(desc(auditRuns.startedAt)).all();
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const findingRows = this.db.select().from(auditFindings).where(inArray(auditFindings.auditRunId, ids)).all();
    const byRun = new Map<string, AuditFinding[]>();
    for (const f of findingRows) {
      const list = byRun.get(f.auditRunId) ?? [];
      list.push(rowToFinding(f));
      byRun.set(f.auditRunId, list);
    }
    return rows.map((r) => rowToRun(r, byRun.get(r.id) ?? []));
  }

  latestForProject(projectId: string): AuditRun | null {
    const row = this.db.select().from(auditRuns)
      .where(eq(auditRuns.projectId, projectId))
      .orderBy(desc(auditRuns.startedAt)).get();
    if (!row) return null;
    return rowToRun(row, this.findingsByRun(row.id));
  }

  findingsByRun(runId: string): AuditFinding[] {
    const rows = this.db.select().from(auditFindings).where(eq(auditFindings.auditRunId, runId))
      .orderBy(auditFindings.severity).all();
    return rows.map(rowToFinding);
  }

  findingById(id: string): AuditFinding | null {
    const row = this.db.select().from(auditFindings).where(eq(auditFindings.id, id)).get();
    return row ? rowToFinding(row) : null;
  }

  updateFindingStatus(id: string, status: AuditFinding['status']): AuditFinding | null {
    this.db.update(auditFindings).set({ status }).where(eq(auditFindings.id, id)).run();
    const row = this.db.select().from(auditFindings).where(eq(auditFindings.id, id)).get();
    return row ? rowToFinding(row) : null;
  }

  promptsByProject(projectId: string): GeneratedPrompt[] {
    const rows = this.db.select().from(generatedPrompts).where(eq(generatedPrompts.projectId, projectId))
      .orderBy(desc(generatedPrompts.createdAt)).all();
    return rows.map(rowToPrompt);
  }

  promptById(id: string): GeneratedPrompt | null {
    const row = this.db.select().from(generatedPrompts).where(eq(generatedPrompts.id, id)).get();
    return row ? rowToPrompt(row) : null;
  }

  updatePrompt(id: string, patch: Partial<GeneratedPromptRow>): GeneratedPrompt | null {
    this.db.update(generatedPrompts).set(patch).where(eq(generatedPrompts.id, id)).run();
    return this.promptById(id);
  }
}
