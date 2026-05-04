# VibeOps Phase 3: memory.md System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate, preview, edit, version, and write `memory.md` to a project's root with explicit user approval. Preserve user-authored sections during refresh. Track every version in the DB. Render markdown safely in the renderer.

**Architecture:** Memory generation is deterministic and template-driven for Phase 3 (no AI yet). The generator consumes `Project` + latest `Scan` + `ScanEnvVar[]` and produces a markdown document by section. A merge mode preserves blocks delimited by HTML comment markers. Phase 4 will swap the deterministic generator for an AI-augmented one behind the same interface.

**Tech Stack:** No new runtime deps for generation. Renderer markdown rendering uses `react-markdown` + `remark-gfm` + `rehype-sanitize`. Editor is a textarea (Monaco-style editor deferred).

**Reference docs:** PRD §12, §22.4, §29.3.

**Prerequisites:** Phase 2 plan complete. `phase-2` git tag exists.

---

## File Structure

```
src/
├── main/
│   ├── db/schema.ts                          # MODIFY — add project_memories
│   ├── memory/
│   │   ├── generator.ts                       # NEW
│   │   ├── merger.ts                          # NEW
│   │   ├── template.ts                        # NEW
│   │   ├── repo.ts                            # NEW
│   │   ├── service.ts                         # NEW
│   │   └── files.ts                           # NEW
│   └── ipc/
│       ├── handlers.ts                        # MODIFY
│       └── memory-handlers.ts                 # NEW
├── shared/
│   ├── ipc-channels.ts                        # MODIFY
│   └── types.ts                               # MODIFY
├── preload/api.ts                             # MODIFY
└── renderer/
    ├── routes/projects/
    │   ├── ProjectDetailRoute.tsx             # MODIFY
    │   └── ProjectMemoryTab.tsx               # NEW
    ├── features/projects/
    │   ├── useMemory.ts                       # NEW
    │   ├── MemoryViewer.tsx                   # NEW
    │   ├── MemoryEditor.tsx                   # NEW
    │   └── MemoryWriteDialog.tsx              # NEW
    └── components/ui/alert-dialog.tsx         # NEW

drizzle/0002_memories.sql                      # NEW

tests/main/
├── memory-generator.test.ts
├── memory-merger.test.ts
├── memory-files.test.ts
└── memory-service.test.ts
```

---

## Task 1: Drizzle schema for memories

**Files:**
- Modify: `E:\Projects\VibeOps\src\main\db\schema.ts`

- [ ] **Step 1: Append table**

Add to bottom of `src/main/db/schema.ts`:

```ts
export const projectMemories = sqliteTable('project_memories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  fileWritten: integer('file_written', { mode: 'boolean' }).notNull().default(false),
  scanId: text('scan_id'),
  createdAt: text('created_at').notNull()
});

export type ProjectMemoryRow = typeof projectMemories.$inferSelect;
```

- [ ] **Step 2: Generate migration + index**

Run: `pnpm db:generate`
Expected: `drizzle/0002_*.sql` created.

Append to the generated SQL:

```sql
CREATE INDEX IF NOT EXISTS idx_project_memories_project_version
  ON project_memories (project_id, version DESC);
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts drizzle/0002_*.sql
git commit -m "feat(db): project_memories table for versioned memory storage"
```

---

## Task 2: Shared types + IPC channels

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`

- [ ] **Step 1: Append to types**

```ts
export type MemorySource = 'generated' | 'merged' | 'user-edited' | 'imported';

export interface Memory {
  id: string;
  projectId: string;
  version: number;
  content: string;
  source: MemorySource;
  fileWritten: boolean;
  scanId: string | null;
  createdAt: string;
}

export interface MemoryDraft {
  projectId: string;
  content: string;
  source: MemorySource;
  scanId: string | null;
}

export type MemoryWriteMode = 'create' | 'replace' | 'merge';

export interface MemoryWriteResult {
  memory: Memory;
  filePath: string;
  backupPath: string | null;
}

export interface MemoryFileStatus {
  exists: boolean;
  filePath: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
}
```

- [ ] **Step 2: Add channels**

Replace `src/shared/ipc-channels.ts`:

```ts
export const IpcChannels = {
  ping: 'app:ping',
  appVersion: 'app:version',

  projectsList: 'projects:list',
  projectsGet: 'projects:get',
  projectsAdd: 'projects:add',
  projectsUpdate: 'projects:update',
  projectsArchive: 'projects:archive',
  projectsUnarchive: 'projects:unarchive',
  projectsRemove: 'projects:remove',
  projectsPickFolder: 'projects:pickFolder',
  projectsCheckPath: 'projects:checkPath',

  scanStart: 'scan:start',
  scanCancel: 'scan:cancel',
  scanGet: 'scan:get',
  scanList: 'scan:list',
  scanLatest: 'scan:latest',
  scanFiles: 'scan:files',
  scanEnvVars: 'scan:envVars',
  scanProgress: 'scan:progress',

  memoryGenerateDraft: 'memory:generateDraft',
  memoryListVersions: 'memory:listVersions',
  memoryGetVersion: 'memory:getVersion',
  memoryGetLatest: 'memory:getLatest',
  memorySaveDraft: 'memory:saveDraft',
  memoryWriteFile: 'memory:writeFile',
  memoryFileStatus: 'memory:fileStatus',
  memoryReadFile: 'memory:readFile',
  memoryOpenInEditor: 'memory:openInEditor'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
```

- [ ] **Step 3: Verify ipc-channels test still passes**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/shared
git commit -m "feat(shared): memory types and IPC channels"
```

---

## Task 3: Memory template + section markers

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\template.ts`

- [ ] **Step 1: Write the file**

```ts
export const USER_BLOCK_OPEN = '<!-- vibeops:user-editable -->';
export const USER_BLOCK_CLOSE = '<!-- /vibeops:user-editable -->';

export interface MemorySectionMeta {
  id: string;
  title: string;
  userEditable: boolean;
}

export const MEMORY_SECTIONS: readonly MemorySectionMeta[] = [
  { id: 'identity', title: '1. Project Identity', userEditable: false },
  { id: 'summary', title: '2. Product Summary', userEditable: true },
  { id: 'users', title: '3. Primary Users', userEditable: true },
  { id: 'stack', title: '4. Current Stack', userEditable: false },
  { id: 'architecture', title: '5. Architecture Overview', userEditable: true },
  { id: 'directories', title: '6. Key Directories', userEditable: false },
  { id: 'files', title: '7. Key Files', userEditable: false },
  { id: 'database', title: '8. Database / Schema Notes', userEditable: true },
  { id: 'apis', title: '9. APIs and Integrations', userEditable: true },
  { id: 'env', title: '10. Environment Variables', userEditable: false },
  { id: 'security', title: '11. Security Notes', userEditable: true },
  { id: 'deployment', title: '12. Deployment Notes', userEditable: true },
  { id: 'issues', title: '13. Known Issues', userEditable: true },
  { id: 'debt', title: '14. Technical Debt', userEditable: true },
  { id: 'roadmap', title: '15. Product Roadmap', userEditable: true },
  { id: 'lastAudit', title: '16. Last Audit Summary', userEditable: false },
  { id: 'aiInstructions', title: '17. Instructions for Future AI Agents', userEditable: true }
];

export function sectionAnchor(id: string): string {
  return `<!-- vibeops:section:${id} -->`;
}

export function sectionAnchorEnd(id: string): string {
  return `<!-- /vibeops:section:${id} -->`;
}

export function wrapUserEditable(body: string): string {
  return `${USER_BLOCK_OPEN}\n${body.trim()}\n${USER_BLOCK_CLOSE}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/memory/template.ts
git commit -m "feat(memory): section template metadata and block markers"
```

---

## Task 4: Memory generator (deterministic)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\generator.ts`
- Create: `E:\Projects\VibeOps\tests\main\memory-generator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/memory-generator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateMemory } from '@main/memory/generator';
import type { Project, Scan, ScanFile, ScanEnvVar } from '@shared/types';

const project: Project = {
  id: 'p1', name: 'Demo App', slug: 'demo-app',
  description: 'A test app', localPath: 'C:/projects/demo',
  repoUrl: 'https://github.com/example/demo', category: 'internal',
  status: 'active', primaryStack: 'Next.js + React',
  tags: ['mvp', 'internal'],
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-04T00:00:00Z',
  lastScannedAt: '2026-05-04T00:00:00Z', lastAuditedAt: null
};

const scan: Scan = {
  id: 's1', projectId: 'p1', status: 'completed',
  summary: 'Next.js Application. Indexed 42 files.',
  detection: {
    projectType: 'Next.js Application', packageManager: 'pnpm',
    frameworks: ['Next.js', 'React', 'Tailwind CSS'],
    database: 'Supabase Postgres', auth: 'Supabase Auth',
    deployment: 'Vercel', primaryStack: 'Next.js + React'
  },
  warnings: [{ code: 'SECRET_FILE_PRESENT', message: '.env present' }],
  fileCount: 42, byteCount: 100_000,
  startedAt: '2026-05-04T00:00:00Z', completedAt: '2026-05-04T00:01:00Z',
  errorMessage: null
};

const files: ScanFile[] = [
  { id: 'f1', projectId: 'p1', scanId: 's1', path: 'package.json', fileType: 'config', sizeBytes: 1000, hash: null, importanceScore: 100, summary: null, lastSeenAt: '2026-05-04' },
  { id: 'f2', projectId: 'p1', scanId: 's1', path: 'app/page.tsx', fileType: 'source', sizeBytes: 500, hash: null, importanceScore: 80, summary: null, lastSeenAt: '2026-05-04' },
  { id: 'f3', projectId: 'p1', scanId: 's1', path: 'README.md', fileType: 'doc', sizeBytes: 200, hash: null, importanceScore: 90, summary: null, lastSeenAt: '2026-05-04' }
];

const envVars: ScanEnvVar[] = [
  { id: 'e1', projectId: 'p1', scanId: 's1', filename: '.env.example', variable: 'DATABASE_URL', required: true, comment: 'Postgres connection' },
  { id: 'e2', projectId: 'p1', scanId: 's1', filename: '.env.example', variable: 'NEXT_PUBLIC_API', required: false, comment: null }
];

describe('generateMemory', () => {
  it('renders project identity', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('# Project Memory: Demo App');
    expect(md).toContain('## 1. Project Identity');
    expect(md).toContain('- Name: Demo App');
    expect(md).toContain('- Local Path: `C:/projects/demo`');
    expect(md).toContain('- Repository: https://github.com/example/demo');
    expect(md).toContain('- Tags: mvp, internal');
  });
  it('renders the detected stack', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('- Frontend: Next.js, React, Tailwind CSS');
    expect(md).toContain('- Database: Supabase Postgres');
    expect(md).toContain('- Auth: Supabase Auth');
    expect(md).toContain('- Hosting: Vercel');
    expect(md).toContain('Package Manager: pnpm');
  });
  it('lists env variable names without values', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toMatch(/\| DATABASE_URL \| Postgres connection \| Yes \|/);
    expect(md).toMatch(/\| NEXT_PUBLIC_API \| .* \| No \|/);
    expect(md).not.toContain('postgres://');
  });
  it('lists key files sorted by importance score', () => {
    const md = generateMemory({ project, scan, files, envVars });
    const idxPkg = md.indexOf('package.json');
    const idxReadme = md.indexOf('README.md');
    const idxApp = md.indexOf('app/page.tsx');
    expect(idxPkg).toBeGreaterThan(0);
    expect(idxPkg).toBeLessThan(idxReadme);
    expect(idxReadme).toBeLessThan(idxApp);
  });
  it('wraps user-editable sections in markers', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('<!-- vibeops:user-editable -->');
    expect(md).toContain('<!-- /vibeops:user-editable -->');
    expect(md).toContain('<!-- vibeops:section:summary -->');
  });
  it('includes a last-audit placeholder when no audit yet', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('Last audit date: Never');
  });
  it('handles missing scan gracefully', () => {
    const md = generateMemory({ project, scan: null, files: [], envVars: [] });
    expect(md).toContain('Run a scan to populate this section.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/memory-generator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/memory/generator.ts`**

```ts
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
    const top = f.path.split('/').slice(0, 2).join('/');
    dirs.set(top, (dirs.get(top) ?? 0) + 1);
  }
  const sorted = Array.from(dirs.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const rows = sorted.map(([dir, n]) => `| \`${dir}\` | ${n} files |`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/memory-generator.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/memory/generator.ts tests/main/memory-generator.test.ts
git commit -m "feat(memory): deterministic memory.md generator"
```

---

## Task 5: Memory merger (preserve user-editable blocks)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\merger.ts`
- Create: `E:\Projects\VibeOps\tests\main\memory-merger.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/memory-merger.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeUserEditableBlocks, extractSectionBodies } from '@main/memory/merger';

const fresh = `# Project Memory: A

<!-- vibeops:section:summary -->
## 2. Product Summary

<!-- vibeops:user-editable -->
Add a short plain-English description.
<!-- /vibeops:user-editable -->
<!-- /vibeops:section:summary -->

<!-- vibeops:section:stack -->
## 4. Current Stack

- Frontend: Next.js
<!-- /vibeops:section:stack -->
`;

const existing = `# Project Memory: A

<!-- vibeops:section:summary -->
## 2. Product Summary

<!-- vibeops:user-editable -->
This app books appointments for plumbers.

It launched in March 2026 for two pilot customers.
<!-- /vibeops:user-editable -->
<!-- /vibeops:section:summary -->

<!-- vibeops:section:stack -->
## 4. Current Stack

- Frontend: ANCIENT JQUERY
<!-- /vibeops:section:stack -->
`;

describe('extractSectionBodies', () => {
  it('returns map of section id to body', () => {
    const map = extractSectionBodies(existing);
    expect(map.has('summary')).toBe(true);
    expect(map.get('summary')).toContain('books appointments for plumbers');
    expect(map.has('stack')).toBe(true);
  });
  it('returns empty map for content without anchors', () => {
    expect(extractSectionBodies('# just a title').size).toBe(0);
  });
});

describe('mergeUserEditableBlocks', () => {
  it('preserves user-editable content but updates non-editable', () => {
    const merged = mergeUserEditableBlocks(fresh, existing);
    expect(merged).toContain('books appointments for plumbers');
    expect(merged).not.toContain('Add a short plain-English description.');
    expect(merged).toContain('Frontend: Next.js');
    expect(merged).not.toContain('ANCIENT JQUERY');
  });
  it('returns the fresh content unchanged when existing is empty', () => {
    expect(mergeUserEditableBlocks(fresh, '')).toBe(fresh);
  });
  it('survives sections that exist in fresh but not existing', () => {
    const reduced = `# Project Memory: A

<!-- vibeops:section:stack -->
## 4. Current Stack
- Frontend: Vite
<!-- /vibeops:section:stack -->
`;
    const merged = mergeUserEditableBlocks(fresh, reduced);
    expect(merged).toContain('Add a short plain-English description.');
    expect(merged).toContain('Frontend: Next.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/memory-merger.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/memory/merger.ts`**

```ts
import { USER_BLOCK_OPEN, USER_BLOCK_CLOSE } from './template';

const SECTION_BODY_RE = /<!-- vibeops:section:([a-z-]+) -->([\s\S]*?)<!-- \/vibeops:section:\1 -->/g;
const USER_BLOCK_RE = new RegExp(
  `${USER_BLOCK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)${USER_BLOCK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  'g'
);

export function extractSectionBodies(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of markdown.matchAll(SECTION_BODY_RE)) {
    const id = match[1];
    const body = match[2] ?? '';
    if (id) out.set(id, body);
  }
  return out;
}

function extractUserBlock(sectionBody: string): string | null {
  const m = USER_BLOCK_RE.exec(sectionBody);
  USER_BLOCK_RE.lastIndex = 0;
  return m ? (m[1] ?? '').trim() : null;
}

export function mergeUserEditableBlocks(fresh: string, existing: string): string {
  if (existing.trim().length === 0) return fresh;
  const existingSections = extractSectionBodies(existing);
  if (existingSections.size === 0) return fresh;

  return fresh.replace(SECTION_BODY_RE, (whole, id: string, body: string) => {
    if (!body.includes(USER_BLOCK_OPEN)) return whole;
    const existingBody = existingSections.get(id);
    if (!existingBody) return whole;
    const userBlock = extractUserBlock(existingBody);
    if (userBlock === null || userBlock.length === 0) return whole;
    const replaced = body.replace(
      USER_BLOCK_RE,
      `${USER_BLOCK_OPEN}\n${userBlock}\n${USER_BLOCK_CLOSE}`
    );
    return `<!-- vibeops:section:${id} -->${replaced}<!-- /vibeops:section:${id} -->`;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/memory-merger.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/memory/merger.ts tests/main/memory-merger.test.ts
git commit -m "feat(memory): merger preserves user-editable blocks across refreshes"
```

---

## Task 6: Atomic file write + backup helpers

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\files.ts`
- Create: `E:\Projects\VibeOps\tests\main\memory-files.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/memory-files.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { writeMemoryFile, readMemoryFile, statMemoryFile } from '@main/memory/files';

let tmp: string;

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-mem-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('writeMemoryFile', () => {
  it('writes new memory.md when none exists, no backup created', async () => {
    const r = await writeMemoryFile(tmp, '# hello');
    expect(r.filePath).toBe(path.join(tmp, 'memory.md'));
    expect(r.backupPath).toBeNull();
    expect(fs.readFileSync(r.filePath, 'utf8')).toBe('# hello');
  });
  it('creates a timestamped backup when overwriting', async () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), '# old');
    const r = await writeMemoryFile(tmp, '# new');
    expect(r.backupPath).not.toBeNull();
    expect(fs.readFileSync(r.backupPath!, 'utf8')).toBe('# old');
    expect(fs.readFileSync(r.filePath, 'utf8')).toBe('# new');
  });
  it('rejects writes outside the project root', async () => {
    await expect(writeMemoryFile('/totally/fake/path', '# x')).rejects.toThrow(/exist|directory/i);
  });
});

describe('readMemoryFile', () => {
  it('returns null when not present', () => {
    expect(readMemoryFile(tmp)).toBeNull();
  });
  it('returns content when present', () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), 'hi');
    expect(readMemoryFile(tmp)).toBe('hi');
  });
});

describe('statMemoryFile', () => {
  it('reports exists=false initially', () => {
    const s = statMemoryFile(tmp);
    expect(s.exists).toBe(false);
    expect(s.sizeBytes).toBeNull();
  });
  it('reports stats when present', () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), 'abc');
    const s = statMemoryFile(tmp);
    expect(s.exists).toBe(true);
    expect(s.sizeBytes).toBe(3);
    expect(s.modifiedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/memory-files.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/memory/files.ts`**

```ts
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { MemoryFileStatus } from '@shared/types';

const FILE_NAME = 'memory.md';

function memoryPath(projectRoot: string): string {
  return path.join(projectRoot, FILE_NAME);
}

function backupPathFor(filePath: string, when: Date): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-');
  return `${filePath}.${stamp}.bak`;
}

export interface WriteResult {
  filePath: string;
  backupPath: string | null;
}

export async function writeMemoryFile(projectRoot: string, content: string): Promise<WriteResult> {
  const stat = await fs.stat(projectRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`Project directory does not exist: ${projectRoot}`);

  const filePath = memoryPath(projectRoot);
  let backupPath: string | null = null;

  try {
    await fs.access(filePath);
    backupPath = backupPathFor(filePath, new Date());
    await fs.copyFile(filePath, backupPath);
  } catch {
    // file did not exist; no backup needed
  }

  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
  return { filePath, backupPath };
}

export function readMemoryFile(projectRoot: string): string | null {
  const filePath = memoryPath(projectRoot);
  try {
    return fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function statMemoryFile(projectRoot: string): MemoryFileStatus {
  const filePath = memoryPath(projectRoot);
  try {
    const s = fsSync.statSync(filePath);
    return { exists: true, filePath, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };
  } catch {
    return { exists: false, filePath, sizeBytes: null, modifiedAt: null };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/memory-files.test.ts`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/memory/files.ts tests/main/memory-files.test.ts
git commit -m "feat(memory): atomic memory.md write with backup and stat helpers"
```

---

## Task 7: Memory repository

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\repo.ts`

- [ ] **Step 1: Write the file**

```ts
import { desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projectMemories, type ProjectMemoryRow } from '@main/db/schema';
import type { Memory, MemorySource } from '@shared/types';

function rowToMemory(row: ProjectMemoryRow): Memory {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    content: row.content,
    source: row.source as MemorySource,
    fileWritten: row.fileWritten,
    scanId: row.scanId,
    createdAt: row.createdAt
  };
}

export interface SaveMemoryArgs {
  id: string;
  projectId: string;
  content: string;
  source: MemorySource;
  scanId: string | null;
  fileWritten: boolean;
}

export class MemoriesRepo {
  constructor(private readonly db: Db) {}

  save(args: SaveMemoryArgs): Memory {
    const last = this.latest(args.projectId);
    const version = (last?.version ?? 0) + 1;
    const createdAt = new Date().toISOString();
    this.db.insert(projectMemories).values({
      id: args.id,
      projectId: args.projectId,
      version,
      content: args.content,
      source: args.source,
      fileWritten: args.fileWritten,
      scanId: args.scanId,
      createdAt
    }).run();
    const row = this.db.select().from(projectMemories).where(eq(projectMemories.id, args.id)).get();
    if (!row) throw new Error('memory vanished after insert');
    return rowToMemory(row);
  }

  byId(id: string): Memory | null {
    const row = this.db.select().from(projectMemories).where(eq(projectMemories.id, id)).get();
    return row ? rowToMemory(row) : null;
  }

  list(projectId: string): Memory[] {
    return this.db.select().from(projectMemories)
      .where(eq(projectMemories.projectId, projectId))
      .orderBy(desc(projectMemories.version)).all().map(rowToMemory);
  }

  latest(projectId: string): Memory | null {
    const row = this.db.select().from(projectMemories)
      .where(eq(projectMemories.projectId, projectId))
      .orderBy(desc(projectMemories.version)).get();
    return row ? rowToMemory(row) : null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/memory/repo.ts
git commit -m "feat(memory): versioned MemoriesRepo"
```

---

## Task 8: Memory service (orchestrator)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\memory\service.ts`
- Create: `E:\Projects\VibeOps\tests\main\memory-service.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/memory-service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pino from 'pino';
import { customAlphabet } from 'nanoid';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';
import { ProjectsService } from '@main/projects/service';
import { ScansRepo } from '@main/scanner/repo';
import { runScan } from '@main/scanner';
import { MemoriesRepo } from '@main/memory/repo';
import { MemoryService } from '@main/memory/service';

const logger = pino({ level: 'silent' });
const id = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

let workdir: string;
let projectDir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-mem-svc-'));
  projectDir = path.join(workdir, 'app');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({ name: 'svc-demo', dependencies: { next: '14', react: '18' } })
  );
  fs.writeFileSync(path.join(projectDir, '.env.example'), 'DATABASE_URL=postgres://x\n');
});
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

async function setup() {
  const handle = openDb(path.join(workdir, 'db.sqlite'));
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  const projectsRepo = new ProjectsRepo(handle.db);
  const projectsService = new ProjectsService(projectsRepo);
  const scansRepo = new ScansRepo(handle.db);
  const memoriesRepo = new MemoriesRepo(handle.db);
  const project = projectsService.add({ name: 'SvcDemo', localPath: projectDir });
  await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });
  const memoryService = new MemoryService({
    memoriesRepo, projectsService, scansRepo,
    newId: () => `m_${id()}`
  });
  return { handle, project, memoryService, memoriesRepo };
}

describe('MemoryService', () => {
  it('generates a draft including detected stack and env vars', async () => {
    const { project, memoryService, handle } = await setup();
    const draft = await memoryService.generateDraft(project.id);
    expect(draft.content).toContain('# Project Memory: SvcDemo');
    expect(draft.content).toContain('Frontend: Next.js, React');
    expect(draft.content).toContain('DATABASE_URL');
    handle.close();
  });

  it('saves a draft and bumps version', async () => {
    const { project, memoryService, memoriesRepo, handle } = await setup();
    const draft = await memoryService.generateDraft(project.id);
    const v1 = memoryService.saveDraft(project.id, draft.content, 'generated');
    const v2 = memoryService.saveDraft(project.id, draft.content + '\n<!-- edit -->', 'user-edited');
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(memoriesRepo.list(project.id)).toHaveLength(2);
    handle.close();
  });

  it('writeFile creates memory.md and records fileWritten=true', async () => {
    const { project, memoryService, handle } = await setup();
    const draft = await memoryService.generateDraft(project.id);
    const saved = memoryService.saveDraft(project.id, draft.content, 'generated');
    const r = await memoryService.writeFile({ projectId: project.id, memoryId: saved.id });
    expect(r.filePath).toBe(path.join(projectDir, 'memory.md'));
    expect(fs.readFileSync(r.filePath, 'utf8')).toBe(saved.content);
    expect(r.memory.fileWritten).toBe(true);
    handle.close();
  });

  it('refresh merges user-editable section from existing file on disk', async () => {
    const { project, memoryService, handle } = await setup();

    const draft1 = await memoryService.generateDraft(project.id);
    const saved1 = memoryService.saveDraft(project.id, draft1.content, 'generated');
    await memoryService.writeFile({ projectId: project.id, memoryId: saved1.id });

    const onDisk = fs.readFileSync(path.join(projectDir, 'memory.md'), 'utf8');
    const edited = onDisk.replace(
      /<!-- vibeops:user-editable -->[\s\S]*?<!-- \/vibeops:user-editable -->/,
      '<!-- vibeops:user-editable -->\nMy custom summary lives here.\n<!-- /vibeops:user-editable -->'
    );
    fs.writeFileSync(path.join(projectDir, 'memory.md'), edited);

    const refreshed = await memoryService.generateDraft(project.id, { mode: 'merge-with-disk' });
    expect(refreshed.content).toContain('My custom summary lives here.');
    expect(refreshed.content).toContain('# Project Memory: SvcDemo');
    handle.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/memory-service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/memory/service.ts`**

```ts
import type { Memory, MemoryDraft, MemorySource, MemoryWriteResult } from '@shared/types';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { MemoriesRepo } from './repo';
import { generateMemory } from './generator';
import { mergeUserEditableBlocks } from './merger';
import { readMemoryFile, statMemoryFile, writeMemoryFile } from './files';

export interface GenerateOptions {
  mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version';
  mergeFromVersion?: number;
}

export interface MemoryServiceDeps {
  memoriesRepo: MemoriesRepo;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  newId: () => string;
}

export class MemoryService {
  constructor(private readonly deps: MemoryServiceDeps) {}

  async generateDraft(projectId: string, opts: GenerateOptions = {}): Promise<MemoryDraft> {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    const scan = this.deps.scansRepo.latestForProject(projectId);
    const files = scan ? this.deps.scansRepo.filesByScan(scan.id) : [];
    const envVars = scan ? this.deps.scansRepo.envVarsByScan(scan.id) : [];

    const fresh = generateMemory({ project, scan, files, envVars });

    let content = fresh;
    if (opts.mode === 'merge-with-disk') {
      const onDisk = readMemoryFile(project.localPath);
      if (onDisk) content = mergeUserEditableBlocks(fresh, onDisk);
    } else if (opts.mode === 'merge-with-version' && opts.mergeFromVersion !== undefined) {
      const versions = this.deps.memoriesRepo.list(projectId);
      const target = versions.find((m) => m.version === opts.mergeFromVersion);
      if (target) content = mergeUserEditableBlocks(fresh, target.content);
    }

    return {
      projectId,
      content,
      source: !opts.mode || opts.mode === 'fresh' ? 'generated' : 'merged',
      scanId: scan?.id ?? null
    };
  }

  saveDraft(projectId: string, content: string, source: MemorySource): Memory {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    const scan = this.deps.scansRepo.latestForProject(projectId);
    return this.deps.memoriesRepo.save({
      id: this.deps.newId(),
      projectId,
      content,
      source,
      scanId: scan?.id ?? null,
      fileWritten: false
    });
  }

  list(projectId: string): Memory[] { return this.deps.memoriesRepo.list(projectId); }
  latest(projectId: string): Memory | null { return this.deps.memoriesRepo.latest(projectId); }
  byId(id: string): Memory | null { return this.deps.memoriesRepo.byId(id); }

  fileStatus(projectId: string) {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    return statMemoryFile(project.localPath);
  }

  readFromDisk(projectId: string): string | null {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    return readMemoryFile(project.localPath);
  }

  async writeFile(args: { projectId: string; memoryId: string }): Promise<MemoryWriteResult> {
    const project = this.deps.projectsService.byId(args.projectId);
    if (!project) throw new Error(`project ${args.projectId} not found`);
    const memory = this.deps.memoriesRepo.byId(args.memoryId);
    if (!memory) throw new Error(`memory ${args.memoryId} not found`);

    const result = await writeMemoryFile(project.localPath, memory.content);

    const next = this.deps.memoriesRepo.save({
      id: this.deps.newId(),
      projectId: project.id,
      content: memory.content,
      source: 'imported',
      scanId: memory.scanId,
      fileWritten: true
    });

    return { memory: next, filePath: result.filePath, backupPath: result.backupPath };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/memory-service.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/memory/service.ts tests/main/memory-service.test.ts
git commit -m "feat(memory): MemoryService generate/save/write/merge orchestration"
```

---

## Task 9: IPC handlers + bootstrap wiring

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ipc\memory-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Write `src/main/ipc/memory-handlers.ts`**

```ts
import { ipcMain, shell } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource } from '@shared/types';
import type { MemoryService } from '@main/memory/service';

export interface MemoryContext {
  service: MemoryService;
  logger: Logger;
  resolveProjectPath: (projectId: string) => string | null;
}

export interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerMemoryHandlers(ctx: MemoryContext): void {
  ipcMain.handle(IpcChannels.memoryGenerateDraft,
    async (_e, payload: { projectId: string; mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version'; version?: number }): Promise<Result<MemoryDraft>> => {
      try {
        const draft = await ctx.service.generateDraft(payload.projectId, {
          mode: payload.mode ?? 'fresh',
          mergeFromVersion: payload.version
        });
        return ok(draft);
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryListVersions, (_e, projectId: string): Result<Memory[]> => {
    try { return ok(ctx.service.list(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryGetLatest, (_e, projectId: string): Result<Memory | null> => {
    try { return ok(ctx.service.latest(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryGetVersion, (_e, memoryId: string): Result<Memory | null> => {
    try { return ok(ctx.service.byId(memoryId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memorySaveDraft,
    (_e, payload: { projectId: string; content: string; source: MemorySource }): Result<Memory> => {
      try { return ok(ctx.service.saveDraft(payload.projectId, payload.content, payload.source)); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryWriteFile,
    async (_e, payload: { projectId: string; memoryId: string }): Promise<Result<MemoryWriteResult>> => {
      try { return ok(await ctx.service.writeFile(payload)); } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.memoryFileStatus, (_e, projectId: string): Result<MemoryFileStatus> => {
    try { return ok(ctx.service.fileStatus(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryReadFile, (_e, projectId: string): Result<string | null> => {
    try { return ok(ctx.service.readFromDisk(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.memoryOpenInEditor, async (_e, projectId: string): Promise<Result<true>> => {
    try {
      const root = ctx.resolveProjectPath(projectId);
      if (!root) throw new Error('project not found');
      await shell.openPath(`${root}\\memory.md`);
      return ok(true);
    } catch (e) { return fail(e); }
  });
}
```

- [ ] **Step 2: Re-export from `handlers.ts`**

Append:

```ts
export { registerMemoryHandlers } from './memory-handlers';
```

- [ ] **Step 3: Wire into `src/main/index.ts`**

Insert imports near the top:

```ts
import { MemoriesRepo } from './memory/repo';
import { MemoryService } from './memory/service';
import { customAlphabet } from 'nanoid';
import { registerMemoryHandlers } from './ipc/handlers';
```

Inside `bootstrap()`, after `const scansRepo = new ScansRepo(handle.db);`, add:

```ts
  const memoriesRepo = new MemoriesRepo(handle.db);
  const memoryIdGen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
  const memoryService = new MemoryService({
    memoriesRepo, projectsService, scansRepo,
    newId: () => `m_${memoryIdGen()}`
  });
```

After the `registerScannerHandlers({...})` block, add:

```ts
  registerMemoryHandlers({
    service: memoryService,
    logger: log,
    resolveProjectPath: (id) => projectsService.byId(id)?.localPath ?? null
  });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm build:typecheck && pnpm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc/memory-handlers.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(ipc): memory handlers wired into bootstrap"
```

---

## Task 10: Preload exposes `memory` namespace

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Extend `api`**

In `src/preload/api.ts`, import the new types and add the `memory` namespace inside `api`:

```ts
import type { Memory, MemoryDraft, MemoryFileStatus, MemoryWriteResult, MemorySource } from '@shared/types';
```

Add inside the `api` object (after `scans`):

```ts
  memory: {
    generateDraft: (projectId: string, mode: 'fresh' | 'merge-with-disk' | 'merge-with-version' = 'fresh', version?: number): Promise<MemoryDraft> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGenerateDraft, { projectId, mode, version })),
    listVersions: (projectId: string): Promise<Memory[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryListVersions, projectId)),
    getLatest: (projectId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetLatest, projectId)),
    getVersion: (memoryId: string): Promise<Memory | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryGetVersion, memoryId)),
    saveDraft: (projectId: string, content: string, source: MemorySource = 'user-edited'): Promise<Memory> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memorySaveDraft, { projectId, content, source })),
    writeFile: (projectId: string, memoryId: string): Promise<MemoryWriteResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryWriteFile, { projectId, memoryId })),
    fileStatus: (projectId: string): Promise<MemoryFileStatus> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryFileStatus, projectId)),
    readFile: (projectId: string): Promise<string | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryReadFile, projectId)),
    openInEditor: (projectId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.memoryOpenInEditor, projectId))
  }
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/api.ts
git commit -m "feat(preload): memory namespace"
```

---

## Task 11: shadcn alert-dialog primitive

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\alert-dialog.tsx`

- [ ] **Step 1: Add radix dep**

Run: `pnpm add @radix-ui/react-alert-dialog`

- [ ] **Step 2: Write `alert-dialog.tsx`**

```tsx
import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', className)} {...props} />
));
AlertDialogOverlay.displayName = 'AlertDialogOverlay';

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl',
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

export const AlertDialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-3 flex flex-col gap-1', className)} {...props} />
);
export const AlertDialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-6 flex justify-end gap-2', className)} {...props} />
);

export const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

export const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

export const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action ref={ref} className={cn(buttonVariants(), className)} {...props} />
));
AlertDialogAction.displayName = 'AlertDialogAction';

export const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel ref={ref} className={cn(buttonVariants({ variant: 'ghost' }), 'mt-0', className)} {...props} />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ui/alert-dialog.tsx package.json pnpm-lock.yaml
git commit -m "feat(ui): alert-dialog primitive"
```

---

## Task 12: Memory hooks

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\useMemory.ts`

- [ ] **Step 1: Write hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Memory, MemoryDraft, MemorySource } from '@shared/types';

const versionsKey = (projectId: string) => ['memory', projectId, 'versions'] as const;
const latestKey = (projectId: string) => ['memory', projectId, 'latest'] as const;
const fileStatusKey = (projectId: string) => ['memory', projectId, 'fileStatus'] as const;

export function useMemoryVersions(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? versionsKey(projectId) : ['memory', '__none__'],
    queryFn: () => (projectId ? api.memory.listVersions(projectId) : Promise.resolve<Memory[]>([])),
    enabled: !!projectId
  });
}

export function useLatestMemory(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['memory', '__none__', 'latest'],
    queryFn: () => (projectId ? api.memory.getLatest(projectId) : Promise.resolve<Memory | null>(null)),
    enabled: !!projectId
  });
}

export function useMemoryFileStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? fileStatusKey(projectId) : ['memory', '__none__', 'fileStatus'],
    queryFn: () => (projectId ? api.memory.fileStatus(projectId) : Promise.resolve(null)),
    enabled: !!projectId
  });
}

export function useGenerateDraft() {
  return useMutation({
    mutationFn: ({ projectId, mode, version }: { projectId: string; mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version'; version?: number }) =>
      api.memory.generateDraft(projectId, mode ?? 'fresh', version)
  });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content, source }: { projectId: string; content: string; source?: MemorySource }) =>
      api.memory.saveDraft(projectId, content, source ?? 'user-edited'),
    onSuccess: (_m, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: latestKey(vars.projectId) });
    }
  });
}

export function useWriteMemoryFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memoryId }: { projectId: string; memoryId: string }) =>
      api.memory.writeFile(projectId, memoryId),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: latestKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: fileStatusKey(vars.projectId) });
    }
  });
}

export function useOpenMemoryInEditor() {
  return useMutation({
    mutationFn: (projectId: string) => api.memory.openInEditor(projectId)
  });
}

export type { Memory, MemoryDraft };
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/projects/useMemory.ts
git commit -m "feat(memory): renderer query hooks"
```

---

## Task 13: Markdown viewer + editor

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\MemoryViewer.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\MemoryEditor.tsx`

- [ ] **Step 1: Add deps**

Run: `pnpm add react-markdown remark-gfm rehype-sanitize`

- [ ] **Step 2: Write `MemoryViewer.tsx`**

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export function MemoryViewer({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none rounded-md border border-border bg-card/40 p-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 3: Write `MemoryEditor.tsx`**

```tsx
import { Textarea } from '@/components/ui/textarea';

export function MemoryEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[600px] font-mono text-xs leading-relaxed"
      spellCheck={false}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/projects/MemoryViewer.tsx src/renderer/features/projects/MemoryEditor.tsx package.json pnpm-lock.yaml
git commit -m "feat(memory): markdown viewer and editor primitives"
```

---

## Task 14: Memory write-confirm dialog

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\MemoryWriteDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { MemoryFileStatus } from '@shared/types';

interface Props {
  open: boolean;
  fileStatus: MemoryFileStatus | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function MemoryWriteDialog({ open, fileStatus, onOpenChange, onConfirm }: Props) {
  const exists = fileStatus?.exists === true;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{exists ? 'Overwrite memory.md?' : 'Write memory.md?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {exists ? (
              <>A <code className="font-mono">memory.md</code> already exists at <code className="font-mono">{fileStatus.filePath}</code>. A timestamped backup will be saved before replacement.</>
            ) : (
              <>Write the current draft to <code className="font-mono">{fileStatus?.filePath}</code>. VibeOps will create the file in the project root.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{exists ? 'Backup and overwrite' : 'Write file'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/projects/MemoryWriteDialog.tsx
git commit -m "feat(memory): write confirmation dialog"
```

---

## Task 15: Memory tab UI

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectMemoryTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectDetailRoute.tsx`

- [ ] **Step 1: Write `ProjectMemoryTab.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Eye, FileText, Pencil, RefreshCw, Save, Sparkles, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MemoryViewer } from '@/features/projects/MemoryViewer';
import { MemoryEditor } from '@/features/projects/MemoryEditor';
import { MemoryWriteDialog } from '@/features/projects/MemoryWriteDialog';
import {
  useGenerateDraft, useSaveDraft, useWriteMemoryFile,
  useMemoryFileStatus, useLatestMemory, useMemoryVersions, useOpenMemoryInEditor
} from '@/features/projects/useMemory';
import type { Project, Memory } from '@shared/types';

type Mode = 'view' | 'edit';

export function ProjectMemoryTab({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<string>('');
  const [draftDirty, setDraftDirty] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: latest } = useLatestMemory(project.id);
  const { data: versions = [] } = useMemoryVersions(project.id);
  const { data: fileStatus } = useMemoryFileStatus(project.id);
  const generate = useGenerateDraft();
  const save = useSaveDraft();
  const write = useWriteMemoryFile();
  const openExternal = useOpenMemoryInEditor();

  useEffect(() => {
    if (!draftDirty && latest?.content) setDraft(latest.content);
  }, [latest?.content, draftDirty]);

  async function onGenerate(refresh: boolean) {
    setError(null);
    try {
      const d = await generate.mutateAsync({
        projectId: project.id,
        mode: refresh ? 'merge-with-disk' : 'fresh'
      });
      setDraft(d.content);
      setDraftDirty(true);
      setMode('view');
    } catch (e) { setError((e as Error).message); }
  }

  async function onSave() {
    setError(null);
    try {
      const m = await save.mutateAsync({ projectId: project.id, content: draft, source: 'user-edited' });
      setDraftDirty(false);
      setPendingMemoryId(m.id);
    } catch (e) { setError((e as Error).message); }
  }

  async function onWriteFile() {
    setError(null);
    let memoryId = pendingMemoryId;
    if (!memoryId || draftDirty) {
      const m = await save.mutateAsync({
        projectId: project.id, content: draft,
        source: draftDirty ? 'user-edited' : 'generated'
      });
      memoryId = m.id;
      setPendingMemoryId(memoryId);
      setDraftDirty(false);
    }
    setWriteOpen(true);
  }

  async function confirmWrite() {
    if (!pendingMemoryId) return;
    setWriteOpen(false);
    try {
      await write.mutateAsync({ projectId: project.id, memoryId: pendingMemoryId });
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Project Memory</CardTitle>
            <CardDescription>
              {fileStatus?.exists
                ? <>memory.md present · {(fileStatus.sizeBytes ?? 0) / 1024 < 1 ? '<1' : ((fileStatus.sizeBytes ?? 0) / 1024).toFixed(1)} KB · modified {fileStatus.modifiedAt?.slice(0, 10)}</>
                : 'No memory.md on disk yet.'}
              {latest && <> · DB version {latest.version}</>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode('view')} disabled={mode === 'view'}>
              <Eye className="h-4 w-4" /> View
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMode('edit')} disabled={mode === 'edit'}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => onGenerate(false)} disabled={generate.isPending}>
              <Sparkles className="h-4 w-4" /> {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onGenerate(true)} disabled={generate.isPending}>
              <RefreshCw className="h-4 w-4" /> Refresh from disk
            </Button>
            <Button variant="outline" size="sm" onClick={onSave} disabled={!draftDirty || save.isPending}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button onClick={onWriteFile} disabled={!draft || write.isPending}>
              <FileText className="h-4 w-4" /> {write.isPending ? 'Writing…' : 'Write memory.md'}
            </Button>
            {fileStatus?.exists && (
              <Button variant="ghost" size="sm" onClick={() => openExternal.mutate(project.id)}>
                <FolderOpen className="h-4 w-4" /> Open externally
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
          {!draft && !generate.isPending && (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No draft yet. Click <span className="font-medium">Generate</span> to build one from the latest scan, or
              <span className="font-medium"> Refresh from disk</span> to merge with an existing memory.md.
            </div>
          )}
          {draft && mode === 'view' && <MemoryViewer markdown={draft} />}
          {draft && mode === 'edit' && (
            <MemoryEditor value={draft} onChange={(next) => { setDraft(next); setDraftDirty(true); }} />
          )}
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version History</CardTitle>
            <CardDescription>Every save and every file write is captured.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {versions.slice(0, 10).map((v: Memory) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="font-medium">v{v.version} · {v.source}</div>
                    <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    {v.fileWritten && <Badge variant="success">written</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => { setDraft(v.content); setDraftDirty(false); setMode('view'); }}>
                      Load
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MemoryWriteDialog
        open={writeOpen}
        fileStatus={fileStatus ?? null}
        onOpenChange={setWriteOpen}
        onConfirm={confirmWrite}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update memory tab in `ProjectDetailRoute.tsx`**

Add import:

```tsx
import { ProjectMemoryTab } from './ProjectMemoryTab';
```

Replace the `Tabs` block with:

```tsx
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="audits" disabled>Audits (Phase 5)</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ProjectOverviewTab project={project} /></TabsContent>
        <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
        <TabsContent value="memory"><ProjectMemoryTab project={project} /></TabsContent>
      </Tabs>
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/projects/ProjectMemoryTab.tsx src/renderer/routes/projects/ProjectDetailRoute.tsx
git commit -m "feat(memory): memory tab with generate, edit, save, write flow"
```

---

## Task 16: Phase 3 acceptance check

- [ ] **Step 1: Run quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Manual flow against PRD §12.6**

Run: `pnpm dev`. Pick a project that already has a Phase 2 scan.

Verify:
- Open Memory tab → empty state shown.
- Click Generate → draft populates the viewer with all 17 sections.
- Switch to Edit → modify the user-editable summary block.
- Save Draft → version history grows by 1.
- Click Write memory.md → confirm dialog appears. Cancel → no file write. Click again → confirm. File written to project root.
- Inspect `<project>/memory.md` in OS file explorer — content matches.
- Edit `memory.md` directly on disk inside the user-editable block.
- Back in app: Refresh from disk → draft now contains the on-disk user content while non-editable sections (stack, key files) match latest scan.
- Click Write again → backup file `memory.md.<timestamp>.bak` appears alongside the new file.
- Click Open externally → memory.md opens in the OS-default markdown app.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a phase-3 -m "Phase 3 complete: memory.md system"
```

---

## Self-Review Notes

- **Spec coverage (PRD §12.6):** generate ✓, prompt before overwrite ✓, preserve user notes ✓ (merger), version history ✓ (`project_memories`), open in internal/external editor ✓.
- **Type consistency:** `MemorySource` shared between renderer hook, IPC payload, repo, and DB column. `MemoryWriteResult.memory.fileWritten` is `boolean` end-to-end (DB stores via `mode: 'boolean'`).
- **Risks:**
  - Merger only preserves text inside `vibeops:user-editable` blocks. Non-editable sections edited directly on disk are overwritten on refresh — intentional, mirroring PRD §12.4 user-section model.
  - Markdown rendering uses `rehype-sanitize` so embedded HTML (e.g., script tags from a malicious memory file) is stripped.
  - File write is atomic via `tmp + rename`; backup is a copy, so the backup never blocks the rename.
- **Phase boundary:** No AI calls. Phase 4 swaps deterministic generator for AI-augmented one behind the same `MemoryService.generateDraft` interface.
