import type { AuditFinding, RiskLevel } from '@shared/types';

const IMPACT: Record<AuditFinding['severity'], number> = {
  critical: 15,
  high: 8,
  medium: 4,
  low: 1,
  info: 0
};

export function scoreFindings(findings: AuditFinding[]): number {
  let score = 100;
  for (const f of findings) score -= IMPACT[f.severity];
  return Math.max(0, Math.min(100, score));
}

export function riskLabel(score: number): RiskLevel {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Work';
  if (score >= 40) return 'Risky';
  return 'Critical';
}
