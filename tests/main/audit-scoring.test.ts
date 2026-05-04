import { describe, it, expect } from 'vitest';
import { scoreFindings, riskLabel } from '@main/audit/scoring';
import type { AuditFinding } from '@shared/types';

function f(severity: AuditFinding['severity']): AuditFinding {
  return {
    id: '1', auditRunId: 'r', projectId: 'p', severity,
    category: 'security', title: 't', description: null,
    filePath: null, lineStart: null, lineEnd: null,
    recommendation: null, suggestedPrompt: null, status: 'open',
    createdAt: '2026-05-04'
  };
}

describe('scoreFindings', () => {
  it('returns 100 with no findings', () => expect(scoreFindings([])).toBe(100));
  it('subtracts 15 per critical', () => expect(scoreFindings([f('critical')])).toBe(85));
  it('subtracts 8 per high', () => expect(scoreFindings([f('high')])).toBe(92));
  it('subtracts 4 per medium', () => expect(scoreFindings([f('medium'), f('medium')])).toBe(92));
  it('subtracts 1 per low', () => expect(scoreFindings([f('low'), f('low'), f('low')])).toBe(97));
  it('ignores info', () => expect(scoreFindings([f('info'), f('info')])).toBe(100));
  it('clamps to 0 minimum', () => {
    const many = Array.from({ length: 20 }, () => f('critical'));
    expect(scoreFindings(many)).toBe(0);
  });
});

describe('riskLabel', () => {
  it('maps to readiness labels', () => {
    expect(riskLabel(95)).toBe('Strong');
    expect(riskLabel(85)).toBe('Good');
    expect(riskLabel(65)).toBe('Needs Work');
    expect(riskLabel(50)).toBe('Risky');
    expect(riskLabel(20)).toBe('Critical');
  });
});
