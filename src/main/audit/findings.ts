import { randomUUID } from 'node:crypto';
import type { AuditFinding, FindingCategory, FindingSeverity } from '@shared/types';

export interface DraftFinding {
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  recommendation?: string;
  suggestedPrompt?: string;
}

export function makeFinding(args: { auditRunId: string; projectId: string; createdAt: string } & DraftFinding): AuditFinding {
  return {
    id: `fnd_${randomUUID()}`,
    auditRunId: args.auditRunId,
    projectId: args.projectId,
    severity: args.severity,
    category: args.category,
    title: args.title,
    description: args.description ?? null,
    filePath: args.filePath ?? null,
    lineStart: args.lineStart ?? null,
    lineEnd: args.lineEnd ?? null,
    recommendation: args.recommendation ?? null,
    suggestedPrompt: args.suggestedPrompt ?? null,
    status: 'open',
    createdAt: args.createdAt
  };
}
