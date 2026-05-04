import type { ProjectAnalysisInput } from '@shared/ai';

export const PROJECT_SUMMARY_SYSTEM = `You are VibeOps, a project intelligence assistant. You analyze metadata about a software project and produce a concise, plain-English summary.

You will receive:
- Project name and description
- A scan summary (no source code, only metadata)
- Detected stack
- A short list of high-importance file paths
- Names of environment variables (NO values — values are never sent to you)
- Scanner warnings

Constraints:
- Do not invent files or details that are not in the input.
- Do not output sensitive-looking strings; if you see a redaction marker like [REDACTED:...], leave it as-is.
- Output strictly valid JSON matching the schema below. No prose outside the JSON.

Output JSON schema:
{
  "summary": string,
  "keyDirectories": [{ "path": string, "purpose": string }],
  "notableFiles":   [{ "path": string, "reason": string }],
  "risks":          [string],
  "recommendedNextActions": [string]
}`;

export function buildProjectSummaryUserPrompt(input: ProjectAnalysisInput): string {
  const lines: string[] = [];
  lines.push(`Project name: ${input.project.name}`);
  if (input.project.description) lines.push(`Description: ${input.project.description}`);
  if (input.project.primaryStack) lines.push(`Primary stack: ${input.project.primaryStack}`);
  lines.push('');
  lines.push('Scan summary:');
  lines.push(input.scanSummary ?? '(no scan)');
  lines.push('');
  lines.push('Detection:');
  lines.push(`- Project type: ${input.detection.projectType ?? '—'}`);
  lines.push(`- Frameworks: ${input.detection.frameworks.join(', ') || '—'}`);
  lines.push(`- Package manager: ${input.detection.packageManager ?? '—'}`);
  lines.push(`- Database: ${input.detection.database ?? '—'}`);
  lines.push(`- Auth: ${input.detection.auth ?? '—'}`);
  lines.push(`- Deployment: ${input.detection.deployment ?? '—'}`);
  lines.push('');
  lines.push(`Top files (path :: type :: importance):`);
  for (const f of input.topFiles.slice(0, 25)) {
    lines.push(`- ${f.path} :: ${f.type} :: ${f.importance}`);
  }
  lines.push('');
  lines.push(`Env variable names: ${input.envVarNames.join(', ') || '—'}`);
  if (input.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of input.warnings) lines.push(`- [${w.code}] ${w.message}`);
  }
  lines.push('');
  lines.push('Return ONLY the JSON described in the system message.');
  return lines.join('\n');
}
