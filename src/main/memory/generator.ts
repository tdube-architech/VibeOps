import type { Project, Scan, ScanFile, ScanEnvVar } from '@shared/types';
import { sectionAnchor, sectionAnchorEnd, wrapUserEditable } from './template';

export interface GenerateInput {
  project: Project;
  scan: Scan | null;
  files: ScanFile[];
  envVars: ScanEnvVar[];
}

function fmtIso(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toISOString().slice(0, 10);
}

function section(id: string, title: string, body: string, userEditable: boolean): string {
  const inner = userEditable ? wrapUserEditable(body) : body;
  return `${sectionAnchor(id)}\n## ${title}\n\n${inner}\n${sectionAnchorEnd(id)}`;
}

function sectionIdentity(p: Project): string {
  return [
    `- Name: ${p.name}`,
    `- Slug: ${p.slug}`,
    p.category ? `- Category: ${p.category}` : '- Category: —',
    `- Status: ${p.status}`,
    `- Local Path: \`${p.localPath}\``,
    `- Repository: ${p.repoUrl ?? '—'}`,
    `- Tags: ${p.tags.length === 0 ? '—' : p.tags.join(', ')}`,
    `- Created: ${fmtIso(p.createdAt)}`,
    `- Last Scanned: ${fmtIso(p.lastScannedAt)}`,
    `- Last Audited: ${fmtIso(p.lastAuditedAt)}`
  ].join('\n');
}

function sectionSummary(p: Project): string {
  return p.description?.trim()
    ? p.description.trim()
    : 'Add a short plain-English description of what this app does and why it exists.';
}

function sectionUsers(): string {
  return ['List the primary user types this app serves.', '', '- TODO: User type 1', '- TODO: User type 2'].join('\n');
}

function sectionStack(scan: Scan | null): string {
  if (!scan) return 'Run a scan to populate this section.';
  const d = scan.detection;
  const lines: string[] = [];
  if (d.frameworks.length > 0) lines.push(`- Frontend: ${d.frameworks.join(', ')}`);
  if (d.database) lines.push(`- Database: ${d.database}`);
  if (d.auth) lines.push(`- Auth: ${d.auth}`);
  if (d.deployment) lines.push(`- Hosting: ${d.deployment}`);
  if (d.packageManager) lines.push(`- Package Manager: ${d.packageManager}`);
  if (d.projectType) lines.push(`- Type: ${d.projectType}`);
  return lines.length > 0 ? lines.join('\n') : '- TODO: Stack details unavailable.';
}

function sectionDirectories(files: ScanFile[]): string {
  if (files.length === 0) return 'Run a scan to populate this section.';
  const dirs = new Map<string, number>();
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length < 2) continue;
    const top = parts[0]!;
    dirs.set(top, (dirs.get(top) ?? 0) + 1);
  }
  if (dirs.size === 0) return 'No subdirectories detected — top-level project.';
  const sorted = Array.from(dirs.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 12);
  const rows = sorted.map(([dir, n]) => `| \`${dir}/\` | ${n} files |`);
  return ['| Path | Notes |', '|---|---|', ...rows].join('\n');
}

function sectionFiles(files: ScanFile[]): string {
  if (files.length === 0) return 'Run a scan to populate this section.';
  const top = [...files].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 25);
  const rows = top.map((f) => `| \`${f.path}\` | ${f.fileType} | importance ${f.importanceScore} |`);
  return ['| File | Type | Notes |', '|---|---|---|', ...rows].join('\n');
}

function sectionDatabase(scan: Scan | null): string {
  if (!scan?.detection.database) return 'TODO: document tables, relationships, RLS notes, known risks.';
  return `Detected: ${scan.detection.database}.\n\nTODO: document tables, relationships, RLS notes, known risks.`;
}

function sectionApis(scan: Scan | null): string {
  if (!scan) return 'TODO: list external services, internal endpoints, webhooks, SDKs.';
  return [
    'TODO: list external services, internal endpoints, webhooks, SDKs.',
    '',
    `Detected stack: ${scan.detection.frameworks.join(', ') || '—'}.`
  ].join('\n');
}

function sectionEnvVars(envVars: ScanEnvVar[]): string {
  if (envVars.length === 0) {
    return ['No `.env.example` found, or no variables extracted.', '', '> VibeOps never reads or stores secret values.'].join('\n');
  }
  const rows = envVars.map((v) => `| ${v.variable} | ${v.comment ?? '—'} | ${v.required ? 'Yes' : 'No'} |`);
  return [
    '> Variable names only. VibeOps never reads or stores secret values.',
    '',
    '| Variable | Purpose | Required |',
    '|---|---|---|',
    ...rows
  ].join('\n');
}

function sectionSecurity(scan: Scan | null): string {
  const lines: string[] = ['TODO: authentication, authorization, RLS, exposed endpoints, secret handling.'];
  if (scan?.warnings.length) {
    lines.push('', 'Scanner warnings:');
    for (const w of scan.warnings) lines.push(`- \`${w.code}\` — ${w.message}`);
  }
  return lines.join('\n');
}

function sectionDeployment(scan: Scan | null): string {
  if (!scan?.detection.deployment) return 'TODO: build command, hosting provider, deployment risks, required services.';
  return [`Target: ${scan.detection.deployment}.`, '', 'TODO: build command, deployment risks, required services.'].join('\n');
}

function sectionLastAudit(p: Project): string {
  return [
    `- Last audit date: ${p.lastAuditedAt ?? 'Never'}`,
    '- Overall score: —',
    '- Critical findings: —',
    '- Recommended next action: Run an audit (Phase 5) once the AI provider is configured.'
  ].join('\n');
}

function sectionAiInstructions(): string {
  return [
    '- Read this file first.',
    '- Do not make broad rewrites unless asked.',
    '- Prefer small, targeted changes.',
    '- Do not change database schema without explaining why.',
    '- Do not remove existing features without approval.',
    '- Summarize all modified files.'
  ].join('\n');
}

const ARCH = 'Describe the major parts of the app and how they work together.';
const DEBT = 'TODO: list duplicated code, weak architecture, missing tests, brittle modules.';
const ISSUES = ['| Severity | Issue | Area | Recommendation |', '|---|---|---|---|', '| — | TODO | — | — |'].join('\n');
const ROADMAP = ['### Next', '- TODO', '', '### Later', '- TODO', '', '### Backlog', '- TODO'].join('\n');

export function generateMemory(input: GenerateInput): string {
  const { project, scan, files, envVars } = input;
  const header = [
    '<!-- This file is generated and maintained by VibeOps. -->',
    '<!-- Sections marked vibeops:user-editable are preserved when refreshed. -->',
    '',
    `# Project Memory: ${project.name}`,
    ''
  ].join('\n');

  const blocks: string[] = [
    section('identity', '1. Project Identity', sectionIdentity(project), false),
    section('summary', '2. Product Summary', sectionSummary(project), true),
    section('users', '3. Primary Users', sectionUsers(), true),
    section('stack', '4. Current Stack', sectionStack(scan), false),
    section('architecture', '5. Architecture Overview', ARCH, true),
    section('directories', '6. Key Directories', sectionDirectories(files), false),
    section('files', '7. Key Files', sectionFiles(files), false),
    section('database', '8. Database / Schema Notes', sectionDatabase(scan), true),
    section('apis', '9. APIs and Integrations', sectionApis(scan), true),
    section('env', '10. Environment Variables', sectionEnvVars(envVars), false),
    section('security', '11. Security Notes', sectionSecurity(scan), true),
    section('deployment', '12. Deployment Notes', sectionDeployment(scan), true),
    section('issues', '13. Known Issues', ISSUES, true),
    section('debt', '14. Technical Debt', DEBT, true),
    section('roadmap', '15. Product Roadmap', ROADMAP, true),
    section('lastAudit', '16. Last Audit Summary', sectionLastAudit(project), false),
    section('aiInstructions', '17. Instructions for Future AI Agents', sectionAiInstructions(), true)
  ];

  return `${header}\n${blocks.join('\n\n')}\n`;
}
