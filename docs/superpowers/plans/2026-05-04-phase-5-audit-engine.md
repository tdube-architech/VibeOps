# VibeOps Phase 5: Read-Only Audit Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a structured, read-only audit on a project. Produce findings across architecture, security, dependency, product completeness, vibe-code quality, and deployment categories. Persist runs and findings. Compute an overall score. Generate a recommended next action and a Claude/Codex-ready prompt for the top issue. Display in the Audits tab.

**Architecture:** The audit engine is a pipeline. **Static checkers** (deterministic, no AI) inspect scan output and a small set of file contents to produce category-tagged findings. An **AI checker** (using the Phase 4 provider) takes the static findings + scan metadata and adds product-completeness/vibe-code-quality findings plus a recommended next action and prompt. Static checkers always run; the AI checker only runs if a provider is active. The pipeline aggregates findings, computes a weighted score (PRD §25), and persists everything via a new `AuditsRepo`.

**Tech Stack:** No new runtime deps. Reuses Phase 4 `ProviderRegistry`, Phase 2 scan repo, Phase 3 memory hooks (audits update `last_audited_at` and section 16 of memory).

**Reference docs:** PRD §13 (Audit), §15 (Prompt Generator), §22.5-§22.6 (audit_runs + audit_findings), §22.10 (generated_prompts), §25 (scoring), §29.5.

**Prerequisites:** Phase 4 plan complete. `phase-4` git tag exists.

---

## File Structure

```
src/
├── main/
│   ├── db/schema.ts                            # MODIFY — audit_runs, audit_findings, generated_prompts
│   ├── audit/
│   │   ├── index.ts                            # NEW — runAudit orchestrator
│   │   ├── repo.ts                             # NEW — AuditsRepo + PromptsRepo
│   │   ├── scoring.ts                          # NEW — score + risk label
│   │   ├── findings.ts                         # NEW — Finding factory + ids
│   │   ├── prompts.ts                          # NEW — safe prompt builder
│   │   ├── checkers/
│   │   │   ├── architecture.ts                 # NEW — static
│   │   │   ├── security.ts                     # NEW — static
│   │   │   ├── dependency.ts                   # NEW — static
│   │   │   ├── deployment.ts                   # NEW — static
│   │   │   ├── vibe-code.ts                    # NEW — static
│   │   │   └── ai-completeness.ts              # NEW — AI-backed
│   │   └── ai-prompt-templates.ts              # NEW
│   └── ipc/
│       ├── handlers.ts                         # MODIFY
│       └── audit-handlers.ts                   # NEW
├── shared/
│   ├── ipc-channels.ts                         # MODIFY
│   └── types.ts                                # MODIFY — AuditRun, Finding, GeneratedPrompt
├── preload/api.ts                              # MODIFY
└── renderer/
    ├── routes/projects/
    │   ├── ProjectDetailRoute.tsx              # MODIFY — enable audits tab
    │   └── ProjectAuditsTab.tsx                # NEW
    └── features/projects/
        ├── useAudits.ts                        # NEW
        ├── AuditScoreRing.tsx                  # NEW
        ├── FindingsTable.tsx                   # NEW
        └── RecommendedPromptCard.tsx           # NEW

drizzle/0003_audits.sql                         # NEW

tests/main/
├── audit-scoring.test.ts                       # NEW
├── audit-checker-security.test.ts              # NEW
├── audit-checker-dependency.test.ts            # NEW
├── audit-checker-deployment.test.ts            # NEW
├── audit-checker-vibe-code.test.ts             # NEW
└── audit-end-to-end.test.ts                    # NEW
```

---

## Task 1: Drizzle schema

**Files:**
- Modify: `E:\Projects\VibeOps\src\main\db\schema.ts`

- [ ] **Step 1: Append tables**

```ts
export const auditRuns = sqliteTable('audit_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id'),
  auditType: text('audit_type').notNull(),
  provider: text('provider'),
  model: text('model'),
  status: text('status').notNull(),
  score: integer('score'),
  riskLevel: text('risk_level'),
  summary: text('summary'),
  recommendedNextAction: text('recommended_next_action'),
  generatedPromptId: text('generated_prompt_id'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  errorMessage: text('error_message')
});

export const auditFindings = sqliteTable('audit_findings', {
  id: text('id').primaryKey(),
  auditRunId: text('audit_run_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  filePath: text('file_path'),
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  recommendation: text('recommendation'),
  suggestedPrompt: text('suggested_prompt'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull()
});

export const generatedPrompts = sqliteTable('generated_prompts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  auditRunId: text('audit_run_id'),
  title: text('title').notNull(),
  promptType: text('prompt_type').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('unused'),
  outcomeNotes: text('outcome_notes'),
  createdAt: text('created_at').notNull(),
  usedAt: text('used_at')
});

export type AuditRunRow = typeof auditRuns.$inferSelect;
export type AuditFindingRow = typeof auditFindings.$inferSelect;
export type GeneratedPromptRow = typeof generatedPrompts.$inferSelect;
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: `drizzle/0003_*.sql` created.

Append:

```sql
CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON audit_findings (audit_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_findings_project ON audit_findings (project_id, severity);
CREATE INDEX IF NOT EXISTS idx_audit_runs_project ON audit_runs (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_prompts_project ON generated_prompts (project_id, created_at DESC);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts drizzle/0003_*.sql
git commit -m "feat(db): audit_runs, audit_findings, generated_prompts tables"
```

---

## Task 2: Shared types + IPC channels

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`

- [ ] **Step 1: Append to types**

```ts
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'dependency'
  | 'product-completeness'
  | 'vibe-code-quality'
  | 'deployment'
  | 'documentation';
export type AuditStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AuditType = 'full' | 'security-only' | 'dependency-only' | 'architecture-only';
export type RiskLevel = 'Strong' | 'Good' | 'Needs Work' | 'Risky' | 'Critical';

export interface AuditFinding {
  id: string;
  auditRunId: string;
  projectId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  recommendation: string | null;
  suggestedPrompt: string | null;
  status: 'open' | 'wont-fix' | 'fixed' | 'ignored';
  createdAt: string;
}

export interface AuditRun {
  id: string;
  projectId: string;
  scanId: string | null;
  auditType: AuditType;
  provider: string | null;
  model: string | null;
  status: AuditStatus;
  score: number | null;
  riskLevel: RiskLevel | null;
  summary: string | null;
  recommendedNextAction: string | null;
  generatedPromptId: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  findings: AuditFinding[];
}

export interface GeneratedPrompt {
  id: string;
  projectId: string;
  auditRunId: string | null;
  title: string;
  promptType: string;
  content: string;
  status: 'unused' | 'used' | 'archived';
  outcomeNotes: string | null;
  createdAt: string;
  usedAt: string | null;
}
```

- [ ] **Step 2: Add channels**

Append before `as const`:

```ts
,
  auditStart: 'audit:start',
  auditList: 'audit:list',
  auditGet: 'audit:get',
  auditLatest: 'audit:latest',
  auditFindings: 'audit:findings',
  auditUpdateFinding: 'audit:updateFinding',
  promptList: 'prompt:list',
  promptGet: 'prompt:get',
  promptUpdate: 'prompt:update'
```

- [ ] **Step 3: Verify channels test**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/shared
git commit -m "feat(shared): audit + finding + prompt types and channels"
```

---

## Task 3: Scoring module

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\scoring.ts`
- Create: `E:\Projects\VibeOps\tests\main\audit-scoring.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/audit-scoring.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to fail**

Run: `pnpm test -- tests/main/audit-scoring.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/audit/scoring.ts`**

```ts
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
```

- [ ] **Step 4: Run test**

Run: `pnpm test -- tests/main/audit-scoring.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/audit/scoring.ts tests/main/audit-scoring.test.ts
git commit -m "feat(audit): scoring and risk-label helpers per PRD §25"
```

---

## Task 4: Finding factory

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\findings.ts`

- [ ] **Step 1: Write file**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/audit/findings.ts
git commit -m "feat(audit): finding factory"
```

---

## Task 5: Static checkers — security, dependency, deployment, architecture, vibe-code

**Files:**
- Create: 5 checker files
- Create: 4 checker tests

### Step group 5A — security checker

- [ ] **5A.1: Test**

`tests/main/audit-checker-security.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkSecurity } from '@main/audit/checkers/security';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';

const baseScan: Scan = {
  id: 's', projectId: 'p', status: 'completed', summary: null,
  detection: {
    projectType: null, packageManager: 'pnpm', frameworks: [],
    database: null, auth: null, deployment: null, primaryStack: null
  },
  warnings: [], fileCount: 0, byteCount: 0,
  startedAt: '2026', completedAt: '2026', errorMessage: null
};

describe('checkSecurity', () => {
  it('flags presence of .env warning', () => {
    const findings = checkSecurity({
      scan: { ...baseScan, warnings: [{ code: 'SECRET_FILE_PRESENT', message: '.env present', filePath: '.env' }] },
      files: [], envVars: [], readText: () => null
    });
    expect(findings.some((f) => f.title.toLowerCase().includes('secret'))).toBe(true);
    expect(findings[0]!.severity).toBe('high');
  });

  it('flags Supabase project missing service-role guard hint', () => {
    const findings = checkSecurity({
      scan: { ...baseScan, detection: { ...baseScan.detection, database: 'Supabase Postgres' } },
      files: [{ id: 'f', projectId: 'p', scanId: 's', path: 'src/server/api.ts', fileType: 'source', sizeBytes: 100, hash: null, importanceScore: 70, summary: null, lastSeenAt: '2026' }],
      envVars: [{ id: 'e', projectId: 'p', scanId: 's', filename: '.env.example', variable: 'SUPABASE_SERVICE_ROLE_KEY', required: true, comment: null }],
      readText: (p) => p === 'src/server/api.ts' ? 'createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)' : null
    });
    expect(findings.some((f) => f.category === 'security' && f.title.includes('service role'))).toBe(true);
  });

  it('flags hardcoded sk- key in source', () => {
    const findings = checkSecurity({
      scan: baseScan,
      files: [{ id: 'f', projectId: 'p', scanId: 's', path: 'src/secret.ts', fileType: 'source', sizeBytes: 100, hash: null, importanceScore: 50, summary: null, lastSeenAt: '2026' }],
      envVars: [],
      readText: (p) => p === 'src/secret.ts' ? 'const k = "sk-ant-abc123def4567890ghi"' : null
    });
    expect(findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('returns empty for clean project', () => {
    const findings = checkSecurity({ scan: baseScan, files: [], envVars: [], readText: () => null });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **5A.2: Run test to fail**

Run: `pnpm test -- tests/main/audit-checker-security.test.ts`
Expected: FAIL.

- [ ] **5A.3: Write `src/main/audit/checkers/security.ts`**

```ts
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

  // 1. Secret-file warnings from scanner.
  for (const w of ctx.scan.warnings) {
    if (w.code === 'SECRET_FILE_PRESENT') {
      out.push({
        severity: 'high',
        category: 'security',
        title: `Secret-bearing file present: ${w.filePath ?? 'unknown'}`,
        description: 'A `.env` (or similar) file exists in the project. VibeOps does not read its contents, but it may be committed by accident.',
        filePath: w.filePath ?? undefined,
        recommendation: 'Add `.env*` to `.gitignore`, audit your git history for accidentally committed secrets, and rotate any exposed keys.'
      });
    }
  }

  // 2. Service-role key visible in source.
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

  // 3. Hardcoded API keys in source.
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
```

- [ ] **5A.4: Run test**

Run: `pnpm test -- tests/main/audit-checker-security.test.ts`
Expected: 4 tests pass.

### Step group 5B — dependency checker

- [ ] **5B.1: Test**

`tests/main/audit-checker-dependency.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkDependencies } from '@main/audit/checkers/dependency';
import type { Scan } from '@shared/types';

const scan: Scan = {
  id: 's', projectId: 'p', status: 'completed', summary: null,
  detection: { projectType: null, packageManager: 'pnpm', frameworks: ['React'], database: null, auth: null, deployment: null, primaryStack: 'React' },
  warnings: [], fileCount: 0, byteCount: 0, startedAt: '', completedAt: '', errorMessage: null
};

describe('checkDependencies', () => {
  it('flags multiple lockfiles as medium', () => {
    const f = checkDependencies({
      scan, files: [], envVars: [],
      readText: () => null,
      hasFile: (p) => ['package-lock.json', 'pnpm-lock.yaml'].includes(p)
    });
    expect(f.some((x) => x.title.includes('Multiple lockfiles'))).toBe(true);
  });

  it('flags missing lockfile when package.json exists as low', () => {
    const f = checkDependencies({
      scan, files: [], envVars: [],
      readText: (p) => p === 'package.json' ? '{"name":"x"}' : null,
      hasFile: (p) => p === 'package.json'
    });
    expect(f.some((x) => x.title.includes('No lockfile'))).toBe(true);
  });

  it('flags suspicious patch dependency on react', () => {
    const f = checkDependencies({
      scan, files: [], envVars: [],
      readText: (p) => p === 'package.json'
        ? JSON.stringify({ dependencies: { react: 'github:vendor/fork#feature' } })
        : null,
      hasFile: (p) => p === 'package.json'
    });
    expect(f.some((x) => x.title.includes('non-registry'))).toBe(true);
  });

  it('returns no findings for clean pnpm project', () => {
    const f = checkDependencies({
      scan, files: [], envVars: [],
      readText: (p) => p === 'package.json' ? '{"dependencies":{"react":"18.0.0"}}' : null,
      hasFile: (p) => ['package.json', 'pnpm-lock.yaml'].includes(p)
    });
    expect(f).toEqual([]);
  });
});
```

- [ ] **5B.2: Run + write**

Run: `pnpm test -- tests/main/audit-checker-dependency.test.ts` (expect FAIL).

Write `src/main/audit/checkers/dependency.ts`:

```ts
import type { DraftFinding } from '../findings';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';

export interface DependencyContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
  hasFile: (relPath: string) => boolean;
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'];

export function checkDependencies(ctx: DependencyContext): DraftFinding[] {
  const out: DraftFinding[] = [];
  const lockPresent = LOCKFILES.filter((p) => ctx.hasFile(p));
  const hasPackageJson = ctx.hasFile('package.json');

  if (lockPresent.length > 1) {
    out.push({
      severity: 'medium', category: 'dependency',
      title: 'Multiple lockfiles detected',
      description: `Found ${lockPresent.join(', ')}. Mixed package managers can cause version drift.`,
      recommendation: 'Pick one package manager and remove other lockfiles.'
    });
  }

  if (hasPackageJson && lockPresent.length === 0) {
    out.push({
      severity: 'low', category: 'dependency',
      title: 'No lockfile present',
      description: 'package.json exists without a corresponding lockfile.',
      recommendation: 'Run `pnpm install` (or your package manager) and commit the lockfile.'
    });
  }

  // Inspect package.json deps for non-registry sources.
  const text = ctx.readText('package.json');
  if (text) {
    try {
      const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const [name, spec] of Object.entries(all)) {
        if (/^(github|git\+|file:|link:|patch:)/i.test(spec) || spec.startsWith('http')) {
          out.push({
            severity: 'medium', category: 'dependency',
            title: `Dependency '${name}' uses non-registry source`,
            description: `Spec: ${spec}`,
            filePath: 'package.json',
            recommendation: 'Consider pinning to a published version or vendoring the patch and documenting why.'
          });
        }
      }
    } catch { /* ignore */ }
  }

  return out;
}
```

Run: `pnpm test -- tests/main/audit-checker-dependency.test.ts`
Expected: 4 tests pass.

### Step group 5C — deployment checker

- [ ] **5C.1: Test**

`tests/main/audit-checker-deployment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkDeployment } from '@main/audit/checkers/deployment';
import type { Scan } from '@shared/types';

const baseScan: Scan = {
  id: 's', projectId: 'p', status: 'completed', summary: null,
  detection: { projectType: null, packageManager: 'pnpm', frameworks: ['Next.js'], database: 'Supabase Postgres', auth: 'Supabase Auth', deployment: null, primaryStack: 'Next.js + React' },
  warnings: [], fileCount: 0, byteCount: 0, startedAt: '', completedAt: '', errorMessage: null
};

describe('checkDeployment', () => {
  it('flags missing deployment target as medium', () => {
    const f = checkDeployment({
      scan: baseScan, files: [], envVars: [],
      readText: () => null, hasFile: () => false
    });
    expect(f.some((x) => x.title.includes('No deployment target'))).toBe(true);
  });

  it('flags missing build script in package.json as medium', () => {
    const f = checkDeployment({
      scan: { ...baseScan, detection: { ...baseScan.detection, deployment: 'Vercel' } },
      files: [], envVars: [],
      readText: (p) => p === 'package.json' ? '{"scripts":{}}' : null,
      hasFile: (p) => p === 'package.json'
    });
    expect(f.some((x) => x.title.includes('build'))).toBe(true);
  });

  it('flags Dockerfile present without compose for risky local dev as low', () => {
    const f = checkDeployment({
      scan: { ...baseScan, detection: { ...baseScan.detection, deployment: 'Docker' } },
      files: [], envVars: [],
      readText: () => null, hasFile: (p) => p === 'Dockerfile'
    });
    expect(f.some((x) => x.severity === 'low')).toBe(true);
  });
});
```

- [ ] **5C.2: Run + write**

Run: `pnpm test -- tests/main/audit-checker-deployment.test.ts` (expect FAIL).

Write `src/main/audit/checkers/deployment.ts`:

```ts
import type { DraftFinding } from '../findings';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';

export interface DeploymentContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
  hasFile: (relPath: string) => boolean;
}

export function checkDeployment(ctx: DeploymentContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  if (!ctx.scan.detection.deployment) {
    out.push({
      severity: 'medium', category: 'deployment',
      title: 'No deployment target detected',
      description: 'No vercel.json, netlify.toml, render.yaml, fly.toml, Dockerfile, or compose file detected.',
      recommendation: 'Document where this project is deployed (or pick a target) and capture build/start commands in README or memory.md.'
    });
  }

  const pkgText = ctx.readText('package.json');
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      if (!scripts.build && (ctx.scan.detection.frameworks.includes('Next.js') || ctx.scan.detection.frameworks.includes('Vite'))) {
        out.push({
          severity: 'medium', category: 'deployment',
          title: 'No `build` script in package.json',
          description: 'A bundler is detected but no `build` script is wired up. Hosts like Vercel and Netlify run `build` by default.',
          filePath: 'package.json',
          recommendation: 'Add a `build` script (e.g. `next build` or `vite build`).'
        });
      }
      if (!scripts.start && ctx.scan.detection.frameworks.includes('Next.js')) {
        out.push({
          severity: 'low', category: 'deployment',
          title: 'No `start` script in package.json',
          description: 'Next.js production servers require `next start` for non-static deployments.',
          filePath: 'package.json',
          recommendation: 'Add `"start": "next start"` if this app is deployed to a Node host.'
        });
      }
    } catch { /* ignore */ }
  }

  if (ctx.hasFile('Dockerfile') && !ctx.hasFile('docker-compose.yml') && !ctx.hasFile('docker-compose.yaml')) {
    out.push({
      severity: 'low', category: 'deployment',
      title: 'Dockerfile present without docker-compose',
      description: 'Local dev parity may be hard. Compose makes multi-service local runs reliable.',
      filePath: 'Dockerfile',
      recommendation: 'Add a `docker-compose.yml` for local development if the app needs services like a DB.'
    });
  }

  return out;
}
```

Run: `pnpm test -- tests/main/audit-checker-deployment.test.ts`
Expected: 3 tests pass.

### Step group 5D — vibe-code-quality checker

- [ ] **5D.1: Test**

`tests/main/audit-checker-vibe-code.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkVibeCode } from '@main/audit/checkers/vibe-code';
import type { ScanFile } from '@shared/types';

function f(path: string, fileType: ScanFile['fileType'] = 'source', importance = 50): ScanFile {
  return { id: path, projectId: 'p', scanId: 's', path, fileType, sizeBytes: 1000, hash: null, importanceScore: importance, summary: null, lastSeenAt: '2026' };
}

describe('checkVibeCode', () => {
  it('flags duplicate-looking component file names', () => {
    const findings = checkVibeCode({
      files: [f('src/Button.tsx'), f('src/components/button.tsx'), f('src/widgets/Button.tsx')],
      readText: () => null
    });
    expect(findings.some((x) => x.title.includes('Duplicate component'))).toBe(true);
  });

  it('flags TODO-heavy files', () => {
    const findings = checkVibeCode({
      files: [f('src/App.tsx')],
      readText: (p) => p === 'src/App.tsx'
        ? Array.from({ length: 8 }).map((_, i) => `// TODO: thing ${i}`).join('\n') + '\nconst x = 1;\n'
        : null
    });
    expect(findings.some((x) => x.title.includes('TODO'))).toBe(true);
  });

  it('flags large source files', () => {
    const big = f('src/Big.tsx', 'source', 50);
    big.sizeBytes = 250_000;
    expect(checkVibeCode({ files: [big], readText: () => null }).some((x) => x.title.includes('Large file'))).toBe(true);
  });

  it('returns empty when clean', () => {
    const findings = checkVibeCode({
      files: [f('src/A.tsx'), f('src/B.tsx')],
      readText: () => 'export const x = 1;'
    });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **5D.2: Run + write**

Run: `pnpm test -- tests/main/audit-checker-vibe-code.test.ts` (expect FAIL).

Write `src/main/audit/checkers/vibe-code.ts`:

```ts
import type { DraftFinding } from '../findings';
import type { ScanFile } from '@shared/types';
import path from 'node:path';

export interface VibeContext {
  files: ScanFile[];
  readText: (relPath: string) => string | null;
}

const TODO_RE = /\b(?:TODO|FIXME|XXX|HACK)\b/g;
const LARGE_FILE_BYTES = 200_000;

export function checkVibeCode(ctx: VibeContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  // 1. Duplicate-looking component basenames across distinct directories.
  const byBase = new Map<string, ScanFile[]>();
  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    const base = path.posix.basename(f.path).toLowerCase();
    if (!base.endsWith('.tsx') && !base.endsWith('.jsx')) continue;
    const list = byBase.get(base) ?? [];
    list.push(f);
    byBase.set(base, list);
  }
  for (const [base, list] of byBase) {
    if (list.length >= 2) {
      out.push({
        severity: 'medium',
        category: 'vibe-code-quality',
        title: `Duplicate component name: ${base}`,
        description: `Found ${list.length} files named "${base}":\n${list.map((f) => `- ${f.path}`).join('\n')}`,
        recommendation: 'Pick one canonical implementation, remove the rest, and update imports.'
      });
    }
  }

  // 2. TODO-heavy files.
  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    const text = ctx.readText(f.path);
    if (!text) continue;
    const todos = text.match(TODO_RE)?.length ?? 0;
    if (todos >= 5) {
      out.push({
        severity: 'low',
        category: 'vibe-code-quality',
        title: `TODO-heavy file: ${f.path} (${todos} markers)`,
        description: 'Many TODO/FIXME/XXX/HACK markers — likely incomplete logic.',
        filePath: f.path,
        recommendation: 'Triage each marker: fix it, file a task, or delete the dead branch.'
      });
    }
  }

  // 3. Large source files.
  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    if (f.sizeBytes > LARGE_FILE_BYTES) {
      out.push({
        severity: 'low',
        category: 'vibe-code-quality',
        title: `Large file: ${f.path}`,
        description: `${(f.sizeBytes / 1024).toFixed(1)} KB. Likely doing too much.`,
        filePath: f.path,
        recommendation: 'Split into focused modules where it makes sense.'
      });
    }
  }

  return out;
}
```

Run: `pnpm test -- tests/main/audit-checker-vibe-code.test.ts`
Expected: 4 tests pass.

### Step group 5E — architecture checker (deterministic skeleton)

- [ ] **5E.1: Write `src/main/audit/checkers/architecture.ts`**

```ts
import type { DraftFinding } from '../findings';
import type { Scan, ScanFile } from '@shared/types';

export interface ArchitectureContext {
  scan: Scan;
  files: ScanFile[];
}

export function checkArchitecture(ctx: ArchitectureContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  if (ctx.scan.detection.frameworks.length === 0) {
    out.push({
      severity: 'low', category: 'architecture',
      title: 'No frontend or backend framework detected',
      description: 'The scanner could not identify a primary framework.',
      recommendation: 'If this project uses an unusual setup, document the entrypoint and architecture in memory.md so future agents can reason about it.'
    });
  }

  const docs = ctx.files.filter((f) => f.fileType === 'doc');
  if (docs.length === 0) {
    out.push({
      severity: 'low', category: 'documentation',
      title: 'No documentation files detected',
      description: 'No README.md, CLAUDE.md, AGENTS.md, or docs/* found.',
      recommendation: 'Add at least a top-level README and run the VibeOps memory generator.'
    });
  }

  // Mixed-routing hint: Next.js with both /app and /pages.
  if (ctx.scan.detection.frameworks.includes('Next.js')) {
    const hasApp = ctx.files.some((f) => f.path.startsWith('app/'));
    const hasPages = ctx.files.some((f) => f.path.startsWith('pages/'));
    if (hasApp && hasPages) {
      out.push({
        severity: 'medium', category: 'architecture',
        title: 'Next.js project mixes /app and /pages directories',
        description: 'Both routing styles exist. This is a common AI-generated mix that confuses Next.js routing.',
        recommendation: 'Pick one router and migrate the rest. Document the choice in memory.md.'
      });
    }
  }

  return out;
}
```

- [ ] **5E.2: Commit all five checkers**

```bash
git add src/main/audit/checkers tests/main/audit-checker-*.test.ts
git commit -m "feat(audit): static checkers — security, dependency, deployment, vibe-code, architecture"
```

---

## Task 6: Audit prompt templates + safe-prompt builder

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\ai-prompt-templates.ts`
- Create: `E:\Projects\VibeOps\src\main\audit\prompts.ts`

- [ ] **Step 1: Write `ai-prompt-templates.ts`**

```ts
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
```

- [ ] **Step 2: Write `prompts.ts`**

```ts
import { randomUUID } from 'node:crypto';
import type { GeneratedPrompt, AuditFinding, Project } from '@shared/types';

export interface BuildPromptArgs {
  project: Project;
  topFinding: AuditFinding | null;
  topPromptTitle?: string;
  topPromptType?: string;
  topPromptGoal?: string;
}

export function buildSafePrompt(args: BuildPromptArgs): { prompt: GeneratedPrompt; content: string } {
  const goal = args.topPromptGoal ??
    (args.topFinding
      ? `Resolve the top audit finding: "${args.topFinding.title}".`
      : 'Improve project quality based on the latest VibeOps audit.');

  const fileHints = args.topFinding?.filePath ? [args.topFinding.filePath] : [];

  const content = [
    `You are working inside ${args.project.name}.`,
    '',
    'Before doing anything:',
    '1. Read memory.md.',
    '2. Inspect only the relevant files listed below.',
    '3. Do not make broad rewrites.',
    '',
    `Goal:`,
    goal,
    '',
    'Rules:',
    '- Do not redesign the UI unless asked.',
    '- Do not change authentication unless required.',
    '- Do not modify database schema without explaining why.',
    '- Do not remove existing functionality.',
    '- Make the smallest safe change.',
    '- Summarize every modified file.',
    '',
    'Relevant Files:',
    ...(fileHints.length > 0 ? fileHints.map((p) => `- ${p}`) : ['- (use memory.md and recent scan output to pick files)']),
    '',
    'Expected Behavior:',
    args.topFinding?.recommendation ?? 'Address the recommendation from the audit; if unclear, propose a plan first.',
    '',
    'Validation:',
    '- Run typecheck if available.',
    '- Run tests if available.',
    '- Report any commands that fail.'
  ].join('\n');

  const prompt: GeneratedPrompt = {
    id: `prm_${randomUUID()}`,
    projectId: args.project.id,
    auditRunId: null,
    title: args.topPromptTitle ?? (args.topFinding ? `Address: ${args.topFinding.title}` : 'Next-step prompt'),
    promptType: args.topPromptType ?? 'fix-bug',
    content,
    status: 'unused',
    outcomeNotes: null,
    createdAt: new Date().toISOString(),
    usedAt: null
  };

  return { prompt, content };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/audit/ai-prompt-templates.ts src/main/audit/prompts.ts
git commit -m "feat(audit): AI audit prompt templates and safe-prompt builder"
```

---

## Task 7: AI completeness checker (using provider registry)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\checkers\ai-completeness.ts`

- [ ] **Step 1: Write the file**

```ts
import type { AIProvider } from '@main/ai/provider';
import type { Scan, ScanFile, AuditFinding } from '@shared/types';
import type { DraftFinding } from '../findings';
import { AI_AUDIT_SYSTEM, buildAuditUserPrompt } from '../ai-prompt-templates';
import { redactSecrets } from '@main/ai/redactor';

export interface AICompletenessInput {
  provider: AIProvider;
  projectName: string;
  scan: Scan;
  files: ScanFile[];
  staticFindings: AuditFinding[];
  signal?: AbortSignal;
}

export interface AICompletenessResult {
  additionalFindings: DraftFinding[];
  recommendedNextAction: string | null;
  topPromptTitle: string | null;
  topPromptType: string | null;
  topPromptGoal: string | null;
  trace: { provider: string; model: string; durationMs: number; redactionsApplied: number; inputTokens: number | null; outputTokens: number | null };
}

interface RawAdditional {
  severity: AuditFinding['severity'];
  category: 'product-completeness' | 'vibe-code-quality';
  title: string;
  description: string;
  filePath: string | null;
  recommendation: string;
}

interface RawAIResponse {
  additionalFindings: RawAdditional[];
  recommendedNextAction: string;
  topPromptTitle: string;
  topPromptType: string;
  topPromptGoal: string;
}

const VALID_SEV = new Set<AuditFinding['severity']>(['critical', 'high', 'medium', 'low', 'info']);
const VALID_CAT = new Set<RawAdditional['category']>(['product-completeness', 'vibe-code-quality']);

export async function runAICompleteness(input: AICompletenessInput): Promise<AICompletenessResult> {
  const t0 = Date.now();
  const userPromptRaw = buildAuditUserPrompt({
    projectName: input.projectName,
    scanSummary: input.scan.summary,
    detection: input.scan.detection,
    topFiles: [...input.files].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 25)
      .map((f) => ({ path: f.path, fileType: f.fileType, importanceScore: f.importanceScore })),
    staticFindings: input.staticFindings,
    warnings: input.scan.warnings
  });
  const redacted = redactSecrets(userPromptRaw);

  // Reuse the provider's analyzeProject? We need a free-form call.
  // The provider interface doesn't expose raw chat — we route through analyzeProject for Anthropic/Mock by reusing system prompt.
  // For Phase 5, treat the AI call as an analyzeProject with a custom system; we already have a structured channel via that method.
  // Workaround: extend AIProvider with a "complete" method below in a minor refactor — but to avoid breaking Phase 4,
  // we use analyzeProject's structured output by piggybacking the system prompt is not possible.
  // Therefore we add a free-form `complete()` to the provider interface in this task's prerequisites.

  throw new Error('runAICompleteness requires AIProvider.complete — added in Task 8');
}
```

> **Note:** This file is intentionally a stub that throws until Task 8 extends the AIProvider interface. We commit it now to lock the shape.

- [ ] **Step 2: Commit**

```bash
git add src/main/audit/checkers/ai-completeness.ts
git commit -m "feat(audit): AI completeness checker stub (pending provider.complete)"
```

---

## Task 8: Extend AIProvider with `complete()` and implement on Anthropic + Mock

**Files:**
- Modify: `E:\Projects\VibeOps\src\main\ai\provider.ts`
- Modify: `E:\Projects\VibeOps\src\main\ai\providers\anthropic.ts`
- Modify: `E:\Projects\VibeOps\src\main\ai\providers\mock.ts`
- Modify: `E:\Projects\VibeOps\src\main\audit\checkers\ai-completeness.ts`

- [ ] **Step 1: Extend interface**

In `src/main/ai/provider.ts`, add to `AIProvider`:

```ts
  complete(args: {
    system: string;
    user: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; model: string; inputTokens: number | null; outputTokens: number | null; durationMs: number }>;
```

- [ ] **Step 2: Implement on Anthropic**

In `src/main/ai/providers/anthropic.ts`, add inside the returned `provider` object:

```ts
      async complete(args) {
        const t0 = Date.now();
        const c = client();
        const resp = await c.messages.create({
          model: args.model ?? defaultModel,
          max_tokens: args.maxTokens ?? 1500,
          temperature: args.temperature ?? 0.2,
          system: args.system,
          messages: [{ role: 'user', content: args.user }]
        }, { signal: args.signal });
        const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
        return {
          text, model: resp.model,
          inputTokens: resp.usage.input_tokens,
          outputTokens: resp.usage.output_tokens,
          durationMs: Date.now() - t0
        };
      }
```

- [ ] **Step 3: Implement on Mock**

In `src/main/ai/providers/mock.ts`, add inside the returned object:

```ts
      async complete(args) {
        return {
          text: JSON.stringify({
            additionalFindings: [{
              severity: 'low',
              category: 'product-completeness',
              title: 'Mock incomplete: example feature',
              description: 'Mock checker emitted a sample finding.',
              filePath: null,
              recommendation: 'Use a real provider for real findings.'
            }],
            recommendedNextAction: 'Configure a real AI provider in Settings.',
            topPromptTitle: 'Configure provider',
            topPromptType: 'prepare-deployment',
            topPromptGoal: 'Set up Anthropic in VibeOps Settings and re-run the audit.'
          }),
          model: 'mock',
          inputTokens: null,
          outputTokens: null,
          durationMs: 1
        };
      }
```

- [ ] **Step 4: Replace `ai-completeness.ts`**

```ts
import type { AIProvider } from '@main/ai/provider';
import type { Scan, ScanFile, AuditFinding } from '@shared/types';
import type { DraftFinding } from '../findings';
import { AI_AUDIT_SYSTEM, buildAuditUserPrompt } from '../ai-prompt-templates';
import { redactSecrets } from '@main/ai/redactor';

export interface AICompletenessInput {
  provider: AIProvider;
  projectName: string;
  scan: Scan;
  files: ScanFile[];
  staticFindings: AuditFinding[];
  signal?: AbortSignal;
}

export interface AICompletenessResult {
  additionalFindings: DraftFinding[];
  recommendedNextAction: string | null;
  topPromptTitle: string | null;
  topPromptType: string | null;
  topPromptGoal: string | null;
  trace: { provider: string; model: string; durationMs: number; redactionsApplied: number; inputTokens: number | null; outputTokens: number | null };
}

interface RawAdditional {
  severity: AuditFinding['severity'];
  category: 'product-completeness' | 'vibe-code-quality';
  title: string;
  description: string;
  filePath: string | null;
  recommendation: string;
}

interface RawAIResponse {
  additionalFindings: RawAdditional[];
  recommendedNextAction: string;
  topPromptTitle: string;
  topPromptType: string;
  topPromptGoal: string;
}

const VALID_SEV = new Set<AuditFinding['severity']>(['critical', 'high', 'medium', 'low', 'info']);
const VALID_CAT = new Set<RawAdditional['category']>(['product-completeness', 'vibe-code-quality']);

function parse(text: string): RawAIResponse | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(cleaned) as RawAIResponse; } catch { return null; }
}

export async function runAICompleteness(input: AICompletenessInput): Promise<AICompletenessResult> {
  const userPromptRaw = buildAuditUserPrompt({
    projectName: input.projectName,
    scanSummary: input.scan.summary,
    detection: input.scan.detection,
    topFiles: [...input.files].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 25)
      .map((f) => ({ path: f.path, fileType: f.fileType, importanceScore: f.importanceScore })),
    staticFindings: input.staticFindings,
    warnings: input.scan.warnings
  });
  const redacted = redactSecrets(userPromptRaw);

  const resp = await input.provider.complete({
    system: AI_AUDIT_SYSTEM,
    user: redacted.text,
    signal: input.signal
  });

  const parsed = parse(resp.text);
  const additionalFindings: DraftFinding[] = [];
  if (parsed) {
    for (const f of parsed.additionalFindings ?? []) {
      if (!VALID_SEV.has(f.severity) || !VALID_CAT.has(f.category)) continue;
      if (typeof f.title !== 'string' || f.title.length === 0) continue;
      additionalFindings.push({
        severity: f.severity,
        category: f.category,
        title: f.title.slice(0, 200),
        description: typeof f.description === 'string' ? f.description.slice(0, 2000) : undefined,
        filePath: typeof f.filePath === 'string' ? f.filePath : undefined,
        recommendation: typeof f.recommendation === 'string' ? f.recommendation.slice(0, 1000) : undefined
      });
    }
  }

  return {
    additionalFindings,
    recommendedNextAction: parsed?.recommendedNextAction ?? null,
    topPromptTitle: parsed?.topPromptTitle ?? null,
    topPromptType: parsed?.topPromptType ?? null,
    topPromptGoal: parsed?.topPromptGoal ?? null,
    trace: {
      provider: input.provider.info().id,
      model: resp.model,
      durationMs: resp.durationMs,
      redactionsApplied: redacted.replaced,
      inputTokens: resp.inputTokens,
      outputTokens: resp.outputTokens
    }
  };
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/main/ai/provider.ts src/main/ai/providers src/main/audit/checkers/ai-completeness.ts
git commit -m "feat(ai): provider.complete() + AI completeness checker"
```

---

## Task 9: Audit repository

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\repo.ts`

- [ ] **Step 1: Write the file**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/audit/repo.ts
git commit -m "feat(audit): AuditsRepo with runs, findings, and prompts"
```

---

## Task 10: runAudit orchestrator + end-to-end test

**Files:**
- Create: `E:\Projects\VibeOps\src\main\audit\index.ts`
- Create: `E:\Projects\VibeOps\tests\main\audit-end-to-end.test.ts`

- [ ] **Step 1: Write `src/main/audit/index.ts`**

```ts
import { customAlphabet } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import type { Logger } from 'pino';
import type { Scan, ScanFile, AuditFinding, AuditRun, AuditType, Project } from '@shared/types';
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

const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export interface AuditDeps {
  auditsRepo: AuditsRepo;
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  registry: ProviderRegistry;
  logger: Logger;
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

    let staticFindings: AuditFinding[] = drafts.map((d) =>
      makeFinding({ auditRunId: id, projectId: project.id, createdAt: startedAt, ...d })
    );
    deps.auditsRepo.insertFindings(staticFindings as never);

    let aiTrace: { provider: string; model: string } | null = null;
    let recommendedNextAction: string | null = null;
    let topPromptTitle: string | null = null;
    let topPromptType: string | null = null;
    let topPromptGoal: string | null = null;
    let aiFindings: AuditFinding[] = [];

    const settingsActive = deps.registry; // resolve below
    let provider = null as Awaited<ReturnType<ProviderRegistry['buildActive']>> | null;
    try { provider = settingsActive.buildActive(); } catch { provider = null; }

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
    const promptResult = buildSafePrompt({
      project, topFinding,
      topPromptTitle: topPromptTitle ?? undefined,
      topPromptType: topPromptType ?? undefined,
      topPromptGoal: topPromptGoal ?? undefined
    });
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

    deps.projectsService.markScanned(project.id);

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
```

- [ ] **Step 2: Write end-to-end test**

`tests/main/audit-end-to-end.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pino from 'pino';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';
import { ProjectsService } from '@main/projects/service';
import { ScansRepo } from '@main/scanner/repo';
import { runScan } from '@main/scanner';
import { AuditsRepo } from '@main/audit/repo';
import { runAudit } from '@main/audit';
import { ProviderRegistry } from '@main/ai/registry';
import { SettingsService } from '@main/settings/service';
import type { SecretStore } from '@main/settings/safe-storage';

const logger = pino({ level: 'silent' });
const fakeStore: SecretStore = {
  isAvailable: () => false,
  encryptToBase64: (s) => `unsafe:${Buffer.from(s).toString('base64')}`,
  decryptFromBase64: (b) => Buffer.from(b.replace('unsafe:', ''), 'base64').toString()
};

let workdir: string;
let projectDir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-aud-e2e-'));
  projectDir = path.join(workdir, 'app');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({
      name: 'demo',
      dependencies: { next: '14', react: '18', '@supabase/supabase-js': '^2' },
      devDependencies: { tailwindcss: '^3' }
    })
  );
  fs.writeFileSync(path.join(projectDir, 'next.config.js'), 'module.exports = {}');
  fs.writeFileSync(path.join(projectDir, '.env.example'), 'SUPABASE_SERVICE_ROLE_KEY=x\n');
  fs.mkdirSync(path.join(projectDir, 'app'));
  fs.writeFileSync(
    path.join(projectDir, 'app/page.tsx'),
    'const c = "sk-ant-aaaaaaaaaaaaaaaaaaaaaa"; export default function P() { return null; }'
  );
  fs.mkdirSync(path.join(projectDir, 'pages'));
  fs.writeFileSync(path.join(projectDir, 'pages/api.ts'), 'export {}');
});
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('runAudit end-to-end', () => {
  it('produces findings, score, prompt without AI provider', async () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);
    const auditsRepo = new AuditsRepo(handle.db);
    const settings = new SettingsService({
      settingsPath: path.join(workdir, 'settings.json'),
      secretsPath: path.join(workdir, 'secrets.json'),
      secretStore: fakeStore
    });
    const registry = new ProviderRegistry(settings);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });
    await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });

    const audit = await runAudit(
      { auditsRepo, scansRepo, projectsService, registry, logger },
      { projectId: project.id }
    );

    expect(audit.status).toBe('completed');
    expect(audit.score).not.toBeNull();
    expect(audit.findings.length).toBeGreaterThan(0);
    expect(audit.findings.some((f) => f.severity === 'critical' && f.title.toLowerCase().includes('hardcoded'))).toBe(true);
    expect(audit.findings.some((f) => f.title.includes('mixes /app and /pages'))).toBe(true);
    expect(audit.generatedPromptId).not.toBeNull();
    expect(audit.summary).toMatch(/score \d+\/100/);

    handle.close();
  });

  it('uses mock provider when active and adds AI findings', async () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);
    const auditsRepo = new AuditsRepo(handle.db);
    const settings = new SettingsService({
      settingsPath: path.join(workdir, 'settings.json'),
      secretsPath: path.join(workdir, 'secrets.json'),
      secretStore: fakeStore
    });
    settings.update({ ai: { ...settings.read().ai, activeProviderId: 'mock' } });
    const registry = new ProviderRegistry(settings);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });
    await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });

    const audit = await runAudit(
      { auditsRepo, scansRepo, projectsService, registry, logger },
      { projectId: project.id }
    );

    expect(audit.provider).toBe('mock');
    expect(audit.findings.some((f) => f.category === 'product-completeness')).toBe(true);
    expect(audit.recommendedNextAction).not.toBeNull();
    handle.close();
  });
});
```

- [ ] **Step 3: Run + iterate**

Run: `pnpm test -- tests/main/audit-end-to-end.test.ts`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/audit/index.ts tests/main/audit-end-to-end.test.ts
git commit -m "feat(audit): runAudit orchestrator and end-to-end coverage"
```

---

## Task 11: IPC handlers + bootstrap wiring

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ipc\audit-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Write `src/main/ipc/audit-handlers.ts`**

```ts
import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { AuditRun, AuditFinding, GeneratedPrompt, AuditType } from '@shared/types';
import { runAudit } from '@main/audit';
import type { AuditsRepo } from '@main/audit/repo';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectsService } from '@main/projects/service';
import type { ProviderRegistry } from '@main/ai/registry';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export interface AuditContext {
  auditsRepo: AuditsRepo;
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  registry: ProviderRegistry;
  logger: Logger;
}

export function registerAuditHandlers(ctx: AuditContext): void {
  ipcMain.handle(IpcChannels.auditStart,
    async (_e, payload: { projectId: string; auditType?: AuditType }): Promise<Result<AuditRun>> => {
      try {
        return ok(await runAudit({
          auditsRepo: ctx.auditsRepo,
          scansRepo: ctx.scansRepo,
          projectsService: ctx.projectsService,
          registry: ctx.registry,
          logger: ctx.logger
        }, { projectId: payload.projectId, auditType: payload.auditType }));
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.auditList, (_e, projectId: string): Result<AuditRun[]> => {
    try { return ok(ctx.auditsRepo.listByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditGet, (_e, auditId: string): Result<AuditRun | null> => {
    try { return ok(ctx.auditsRepo.byId(auditId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditLatest, (_e, projectId: string): Result<AuditRun | null> => {
    try { return ok(ctx.auditsRepo.latestForProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditFindings, (_e, auditRunId: string): Result<AuditFinding[]> => {
    try { return ok(ctx.auditsRepo.findingsByRun(auditRunId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditUpdateFinding,
    (_e, payload: { id: string; status: AuditFinding['status'] }): Result<AuditFinding | null> => {
      try { return ok(ctx.auditsRepo.updateFindingStatus(payload.id, payload.status)); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.promptList, (_e, projectId: string): Result<GeneratedPrompt[]> => {
    try { return ok(ctx.auditsRepo.promptsByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.promptGet, (_e, id: string): Result<GeneratedPrompt | null> => {
    try { return ok(ctx.auditsRepo.promptById(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.promptUpdate,
    (_e, payload: { id: string; status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null }): Result<GeneratedPrompt | null> => {
      try {
        const patch: Record<string, unknown> = {};
        if (payload.status !== undefined) patch.status = payload.status;
        if (payload.outcomeNotes !== undefined) patch.outcomeNotes = payload.outcomeNotes;
        if (payload.usedAt !== undefined) patch.usedAt = payload.usedAt;
        return ok(ctx.auditsRepo.updatePrompt(payload.id, patch as never));
      } catch (e) { return fail(e); }
    }
  );
}
```

- [ ] **Step 2: Re-export from `handlers.ts`**

Append:

```ts
export { registerAuditHandlers } from './audit-handlers';
```

- [ ] **Step 3: Wire into `src/main/index.ts`**

Add imports:

```ts
import { AuditsRepo } from './audit/repo';
import { registerAuditHandlers } from './ipc/handlers';
```

Inside `bootstrap()`, after creating `aiRegistry`, add:

```ts
  const auditsRepo = new AuditsRepo(handle.db);
```

After `registerAIHandlers({...})` block, add:

```ts
  registerAuditHandlers({
    auditsRepo, scansRepo, projectsService,
    registry: aiRegistry, logger: log
  });
```

- [ ] **Step 4: Tests + typecheck**

Run: `pnpm build:typecheck && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/audit-handlers.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(ipc): audit + prompt handlers wired"
```

---

## Task 12: Preload exposes audits + prompts namespaces

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Add namespaces**

Imports to add:

```ts
import type { AuditRun, AuditFinding, GeneratedPrompt, AuditType } from '@shared/types';
```

Inside the `api` object:

```ts
  audits: {
    start: (projectId: string, auditType?: AuditType): Promise<AuditRun> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditStart, { projectId, auditType })),
    list: (projectId: string): Promise<AuditRun[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditList, projectId)),
    get: (auditId: string): Promise<AuditRun | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditGet, auditId)),
    latest: (projectId: string): Promise<AuditRun | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditLatest, projectId)),
    findings: (auditRunId: string): Promise<AuditFinding[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditFindings, auditRunId)),
    updateFinding: (id: string, status: AuditFinding['status']): Promise<AuditFinding | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.auditUpdateFinding, { id, status }))
  },
  prompts: {
    list: (projectId: string): Promise<GeneratedPrompt[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptList, projectId)),
    get: (id: string): Promise<GeneratedPrompt | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptGet, id)),
    update: (id: string, patch: { status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null }): Promise<GeneratedPrompt | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.promptUpdate, { id, ...patch }))
  }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/api.ts
git commit -m "feat(preload): audits + prompts namespaces"
```

---

## Task 13: Renderer audit hooks + components

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\useAudits.ts`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\AuditScoreRing.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\FindingsTable.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\RecommendedPromptCard.tsx`

- [ ] **Step 1: Write `useAudits.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuditRun, AuditFinding, GeneratedPrompt } from '@shared/types';

const auditsKey = (projectId: string) => ['audits', projectId] as const;
const latestKey = (projectId: string) => ['audits', projectId, 'latest'] as const;
const promptsKey = (projectId: string) => ['prompts', projectId] as const;

export function useAuditList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? auditsKey(projectId) : ['audits', '__none__'],
    queryFn: () => (projectId ? api.audits.list(projectId) : Promise.resolve<AuditRun[]>([])),
    enabled: !!projectId
  });
}

export function useLatestAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['audits', '__none__', 'latest'],
    queryFn: () => (projectId ? api.audits.latest(projectId) : Promise.resolve<AuditRun | null>(null)),
    enabled: !!projectId
  });
}

export function useStartAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.audits.start(projectId),
    onSuccess: (_run, projectId) => {
      qc.invalidateQueries({ queryKey: auditsKey(projectId) });
      qc.invalidateQueries({ queryKey: latestKey(projectId) });
      qc.invalidateQueries({ queryKey: promptsKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}

export function useUpdateFinding() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AuditFinding['status'] }) =>
      api.audits.updateFinding(id, status)
  });
}

export function usePrompts(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? promptsKey(projectId) : ['prompts', '__none__'],
    queryFn: () => (projectId ? api.prompts.list(projectId) : Promise.resolve<GeneratedPrompt[]>([])),
    enabled: !!projectId
  });
}

export function useUpdatePrompt() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null } }) =>
      api.prompts.update(id, patch)
  });
}
```

- [ ] **Step 2: Write `AuditScoreRing.tsx`**

```tsx
import type { RiskLevel } from '@shared/types';

const COLORS: Record<RiskLevel, string> = {
  Strong: 'text-emerald-500',
  Good: 'text-emerald-400',
  'Needs Work': 'text-amber-500',
  Risky: 'text-orange-500',
  Critical: 'text-red-500'
};

export function AuditScoreRing({ score, risk }: { score: number; risk: RiskLevel }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={COLORS[risk]}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="text-2xl font-semibold">{score}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{risk}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `FindingsTable.tsx`**

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuditFinding } from '@shared/types';
import { useUpdateFinding } from './useAudits';

const SEV_BADGE: Record<AuditFinding['severity'], 'default' | 'secondary' | 'warning' | 'destructive' | 'outline' | 'success'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
  info: 'outline'
};

export function FindingsTable({ findings }: { findings: AuditFinding[] }) {
  const update = useUpdateFinding();
  if (findings.length === 0) {
    return <div className="text-sm text-muted-foreground">No findings yet.</div>;
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-2">
      {sorted.map((f) => (
        <div key={f.id} className="rounded-md border border-border bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={SEV_BADGE[f.severity]}>{f.severity}</Badge>
                <Badge variant="outline">{f.category}</Badge>
                {f.status !== 'open' && <Badge variant="secondary">{f.status}</Badge>}
                <span className="font-medium">{f.title}</span>
              </div>
              {f.filePath && <div className="text-xs font-mono text-muted-foreground">{f.filePath}</div>}
              {f.description && <p className="text-sm text-muted-foreground">{f.description}</p>}
              {f.recommendation && (
                <p className="text-sm">
                  <span className="font-medium">Fix:</span> {f.recommendation}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, status: 'fixed' })}>Mark fixed</Button>
              <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, status: 'ignored' })}>Ignore</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write `RecommendedPromptCard.tsx`**

```tsx
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUpdatePrompt } from './useAudits';
import type { GeneratedPrompt } from '@shared/types';

export function RecommendedPromptCard({ prompt }: { prompt: GeneratedPrompt | null }) {
  const update = useUpdatePrompt();
  const [copied, setCopied] = useState(false);

  if (!prompt) return null;

  async function copy() {
    await navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    if (prompt.status === 'unused') {
      update.mutate({ id: prompt.id, patch: { status: 'used', usedAt: new Date().toISOString() } });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Recommended Prompt</CardTitle>
          <CardDescription>{prompt.title} · {prompt.promptType} · {prompt.status}</CardDescription>
        </div>
        <Button onClick={copy} variant="outline" size="sm">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-card/40 p-4 text-xs leading-relaxed font-mono">
{prompt.content}
        </pre>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/projects/useAudits.ts src/renderer/features/projects/AuditScoreRing.tsx src/renderer/features/projects/FindingsTable.tsx src/renderer/features/projects/RecommendedPromptCard.tsx
git commit -m "feat(audit): renderer hooks and presentation components"
```

---

## Task 14: Audits tab + wire into project detail

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectAuditsTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectDetailRoute.tsx`

- [ ] **Step 1: Write `ProjectAuditsTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditScoreRing } from '@/features/projects/AuditScoreRing';
import { FindingsTable } from '@/features/projects/FindingsTable';
import { RecommendedPromptCard } from '@/features/projects/RecommendedPromptCard';
import { useAuditList, useLatestAudit, useStartAudit, usePrompts } from '@/features/projects/useAudits';
import type { Project, AuditRun, GeneratedPrompt } from '@shared/types';

export function ProjectAuditsTab({ project }: { project: Project }) {
  const start = useStartAudit();
  const { data: list = [] } = useAuditList(project.id);
  const { data: latest, refetch: refetchLatest } = useLatestAudit(project.id);
  const { data: prompts = [] } = usePrompts(project.id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void refetchLatest(); }, [list.length, refetchLatest]);

  async function run() {
    setError(null);
    try { await start.mutateAsync(project.id); }
    catch (e) { setError((e as Error).message); }
  }

  const topPrompt: GeneratedPrompt | null =
    latest?.generatedPromptId
      ? prompts.find((p) => p.id === latest.generatedPromptId) ?? null
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Audits</CardTitle>
            <CardDescription>Read-only audit. No code is modified. AI completeness checks run if a provider is active.</CardDescription>
          </div>
          <Button onClick={run} disabled={start.isPending}>
            <Play className="h-4 w-4" /> {start.isPending ? 'Running…' : 'Run Audit'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {!latest && !start.isPending && (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No audit yet. A scan must exist first; then click "Run Audit".
            </div>
          )}
          {latest && (
            <div className="flex items-start gap-6">
              <AuditScoreRing score={latest.score ?? 0} risk={latest.riskLevel ?? 'Critical'} />
              <div className="flex-1 space-y-2">
                <div className="text-sm">{latest.summary}</div>
                {latest.recommendedNextAction && (
                  <div className="text-sm">
                    <span className="font-medium">Recommended next action:</span> {latest.recommendedNextAction}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {latest.provider && <Badge variant="outline"><Sparkles className="h-3 w-3" /> {latest.provider} · {latest.model}</Badge>}
                  <span>Started {new Date(latest.startedAt).toLocaleString()}</span>
                  {latest.completedAt && <span>· {((new Date(latest.completedAt).getTime() - new Date(latest.startedAt).getTime()) / 1000).toFixed(1)}s</span>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {latest && <RecommendedPromptCard prompt={topPrompt} />}
      {latest && (
        <Card>
          <CardHeader><CardTitle className="text-base">Findings</CardTitle></CardHeader>
          <CardContent><FindingsTable findings={latest.findings} /></CardContent>
        </Card>
      )}

      {list.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {list.slice(0, 10).map((r: AuditRun) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="font-medium">{r.completedAt ? new Date(r.completedAt).toLocaleString() : 'in progress'}</div>
                    <div className="text-xs text-muted-foreground">
                      score {r.score ?? '—'} · {r.findings.length} findings · {r.riskLevel ?? '—'}
                    </div>
                  </div>
                  <Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into `ProjectDetailRoute.tsx`**

Add import:

```tsx
import { ProjectAuditsTab } from './ProjectAuditsTab';
```

Replace the `Tabs` block:

```tsx
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="audits">Audits</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ProjectOverviewTab project={project} /></TabsContent>
        <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
        <TabsContent value="memory"><ProjectMemoryTab project={project} /></TabsContent>
        <TabsContent value="audits"><ProjectAuditsTab project={project} /></TabsContent>
      </Tabs>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/projects/ProjectAuditsTab.tsx src/renderer/routes/projects/ProjectDetailRoute.tsx
git commit -m "feat(audit): audits tab with score, findings, and prompt"
```

---

## Task 15: Phase 5 acceptance check

- [ ] **Step 1: Run quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Manual flow against PRD §13.5**

Run: `pnpm dev`. Pick a project that already has a Phase 2 scan.

Verify:
- Open Audits tab → empty state.
- Click Run Audit. Audit completes within seconds (without AI) or 5-30s (with AI).
- Score ring renders with score 0-100 and a risk label.
- Findings list shows critical/high/medium/low items in distinct colors.
- Recommended Prompt card shows a multi-section prompt that copies to clipboard. Status flips to `used` after copy.
- Click "Mark fixed" on a finding → its badge updates.
- Open `%APPDATA%\VibeOps\vibeops.db` and run `SELECT id, score, risk_level FROM audit_runs;` → row(s) present. `SELECT COUNT(*) FROM audit_findings;` > 0. `SELECT * FROM generated_prompts LIMIT 1;` shows the safe prompt.
- Run Audit again → second row appears in History.
- Try with no AI provider configured → audit still completes; only static findings appear.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a phase-5 -m "Phase 5 complete: read-only audit engine"
```

---

## Self-Review Notes

- **Spec coverage (PRD §13.5):** run audit ✓, audit saved locally ✓, findings displayed ✓, severities visually distinct ✓ (badge variants), audit does not modify code ✓ (no fs writes), recommended next action ✓, Claude/Codex prompt ✓ (`buildSafePrompt`).
- **Spec coverage (PRD §15.3 prompt structure):** rules block ✓, relevant files ✓, expected behavior ✓, validation ✓.
- **Spec coverage (PRD §25 scoring):** weights mapped exactly to severity impact, risk labels mapped to ranges.
- **Type consistency:** `FindingSeverity`, `FindingCategory`, `RiskLevel`, `AuditStatus` shared end-to-end. `AuditRun.findings` always populated by repo (no separate fetch needed for the tab to render).
- **Risks:**
  - The AI checker silently degrades to static-only when no provider is active or when the AI call fails. We log a warn but the audit still completes. This matches PRD acceptance §13.5 ("audit produces a score and prompt").
  - File reads inside checkers respect a 256 KB cap. Larger files contribute via metadata only.
  - Static checkers do not look at all dependencies; we don't ship a vulnerability database in MVP. The dependency checker focuses on hygiene (multiple lockfiles, non-registry sources). PRD §13.2 lists vulnerable-package detection as future work.
- **Phase boundary:** Phase 6 packages and polishes. No new functionality.
