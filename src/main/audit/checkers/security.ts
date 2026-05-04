import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import type { DraftFinding } from '../findings';

export interface CheckerContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
}

const HARDCODED_KEY_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'anthropic', re: /sk-ant-[A-Za-z0-9_\-]{12,}/ },
  { name: 'openai', re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}/ },
  { name: 'aws-access', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ }
];

export function checkSecurity(ctx: CheckerContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  for (const w of ctx.scan.warnings) {
    if (w.code === 'SECRET_FILE_PRESENT') {
      const finding: DraftFinding = {
        severity: 'high',
        category: 'security',
        title: `Secret-bearing file present: ${w.filePath ?? 'unknown'}`,
        description: 'A `.env` (or similar) file exists in the project. VibeOps does not read its contents, but it may be committed by accident.',
        recommendation: 'Add `.env*` to `.gitignore`, audit your git history for accidentally committed secrets, and rotate any exposed keys.'
      };
      if (w.filePath) finding.filePath = w.filePath;
      out.push(finding);
    }
  }

  if (ctx.scan.detection.database === 'Supabase Postgres') {
    const serviceRoleVar = ctx.envVars.find((v) => /SERVICE[_-]?ROLE/i.test(v.variable));
    if (serviceRoleVar) {
      for (const f of ctx.files) {
        if (f.fileType !== 'source') continue;
        const text = ctx.readText(f.path);
        if (!text) continue;
        if (text.includes(serviceRoleVar.variable)) {
          out.push({
            severity: 'critical',
            category: 'security',
            title: `Possible service role key reference in ${f.path}`,
            description: `Found a reference to ${serviceRoleVar.variable} in source code. Service-role keys must never be exposed to the browser.`,
            filePath: f.path,
            recommendation: 'Move all service-role usage to a server-only file (e.g. `app/api/*` or a server route) and audit imports.'
          });
        }
      }
    }
  }

  for (const f of ctx.files) {
    if (f.fileType !== 'source' && f.fileType !== 'config') continue;
    const text = ctx.readText(f.path);
    if (!text) continue;
    for (const p of HARDCODED_KEY_PATTERNS) {
      if (p.re.test(text)) {
        out.push({
          severity: 'critical',
          category: 'security',
          title: `Hardcoded ${p.name} key in ${f.path}`,
          description: `Found a token matching the ${p.name} key shape directly in source.`,
          filePath: f.path,
          recommendation: `Move the secret to an environment variable, rotate the exposed key, and check git history.`
        });
        break;
      }
    }
  }

  return out;
}
