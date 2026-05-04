import type { Scan, ScanFile, AuditFinding } from '@shared/types';

export const AI_AUDIT_SYSTEM = `You are VibeOps, an AI auditor for AI/vibe-coded software projects. You receive:
- The detected stack of a project
- A short list of high-importance files (paths only)
- A list of static findings already collected
- Optional scanner warnings

Your job is to add findings the static checkers may have missed in two categories:
- "product-completeness": features that look incomplete (e.g. UI without backing endpoint, mock data left in production)
- "vibe-code-quality": AI-generated patterns the static checker did not catch (orphan files, conflicting patterns, dead routes)

You must NOT invent files or details. If unsure, say nothing.

Output strictly valid JSON:
{
  "additionalFindings": [
    {
      "severity": "critical"|"high"|"medium"|"low"|"info",
      "category": "product-completeness"|"vibe-code-quality",
      "title": string,
      "description": string,
      "filePath": string|null,
      "recommendation": string
    }
  ],
  "recommendedNextAction": string,
  "topPromptTitle": string,
  "topPromptType": "fix-bug"|"finish-feature"|"refactor"|"audit-module"|"prepare-deployment",
  "topPromptGoal": string
}
`;

export interface AuditAIInput {
  projectName: string;
  scanSummary: string | null;
  detection: Scan['detection'];
  topFiles: Array<Pick<ScanFile, 'path' | 'fileType' | 'importanceScore'>>;
  staticFindings: AuditFinding[];
  warnings: Scan['warnings'];
}

export function buildAuditUserPrompt(input: AuditAIInput): string {
  const lines: string[] = [];
  lines.push(`Project: ${input.projectName}`);
  if (input.detection.primaryStack) lines.push(`Primary stack: ${input.detection.primaryStack}`);
  lines.push('');
  if (input.scanSummary) {
    lines.push('Scan summary:');
    lines.push(input.scanSummary);
    lines.push('');
  }
  lines.push('Top files (path :: type :: importance):');
  for (const f of input.topFiles.slice(0, 25)) {
    lines.push(`- ${f.path} :: ${f.fileType} :: ${f.importanceScore}`);
  }
  lines.push('');
  lines.push('Static findings already collected:');
  if (input.staticFindings.length === 0) lines.push('- (none)');
  for (const f of input.staticFindings) {
    lines.push(`- [${f.severity}/${f.category}] ${f.title}${f.filePath ? ` (${f.filePath})` : ''}`);
  }
  lines.push('');
  if (input.warnings.length > 0) {
    lines.push('Scanner warnings:');
    for (const w of input.warnings) lines.push(`- [${w.code}] ${w.message}`);
  }
  lines.push('');
  lines.push('Return ONLY the JSON described in the system prompt.');
  return lines.join('\n');
}
