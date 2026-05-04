import type { RiskLevel } from '@shared/types';

export function riskLabelFromScore(score: number): RiskLevel {
  if (score >= 90) return 'Strong';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Needs Work';
  if (score >= 40) return 'Risky';
  return 'Critical';
}
