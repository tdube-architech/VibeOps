# VibeOps Phase 2: Project Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk a registered project folder, classify files, detect stack/frameworks/package manager/database/auth/deployment, extract `.env.example` variable **names only**, and persist scan results. Surface scan summary on the project detail page. No AI, no shell commands, no secret values stored.

**Architecture:** Scanner runs inside main process (single-process MVP — Node worker thread is overkill for read-only file walks under 100k files). Scan triggered via IPC. Scanner is composed of pure functions (`walkTree`, `classifyFile`, detection rules) wrapping a Drizzle-backed repository. Progress reported via `webContents.send`. Streaming progress events use a single `scan:progress` channel keyed by `scanId`.

**Tech Stack:** `fast-glob` for tree walk, `ignore` for `.gitignore`-style filters, `dotenv` ONLY as a parser (we never load values into env), Node `crypto` for file hashing, existing Drizzle infra.

**Reference docs:** PRD §11 (Scanner), §22.2-§22.3 (project_scans + project_files), §24 (algorithm), §29.2.

**Prerequisites:** Phase 1 plan complete. `phase-1` git tag exists.

---

## File Structure

```
src/
├── main/
│   ├── db/
│   │   └── schema.ts                          # MODIFY — add scans + files tables
│   ├── scanner/
│   │   ├── index.ts                           # NEW — public scan() entrypoint
│   │   ├── walker.ts                          # NEW — fast-glob + ignore wrapper
│   │   ├── ignore-rules.ts                    # NEW — default ignore set
│   │   ├── classify.ts                        # NEW — file_type + importance scoring
│   │   ├── detectors/
│   │   │   ├── index.ts                       # NEW — orchestrator
│   │   │   ├── package-manager.ts             # NEW
│   │   │   ├── frameworks.ts                  # NEW
│   │   │   ├── database.ts                    # NEW
│   │   │   ├── auth.ts                        # NEW
│   │   │   ├── deployment.ts                  # NEW
│   │   │   └── env-vars.ts                    # NEW — parses .env.example for names
│   │   ├── summary.ts                         # NEW — builds plain-English summary
│   │   ├── repo.ts                            # NEW — scans + files persistence
│   │   └── progress.ts                        # NEW — emits scan:progress events
│   ├── projects/
│   │   └── service.ts                         # MODIFY — bump lastScannedAt on scan completion
│   └── ipc/
│       ├── handlers.ts                        # MODIFY — re-export
│       └── scanner-handlers.ts                # NEW
├── shared/
│   ├── ipc-channels.ts                        # MODIFY — scan channels
│   ├── types.ts                               # MODIFY — Scan, ScanFile, DetectionResult
│   └── scan-events.ts                         # NEW — progress event shape
├── preload/
│   └── api.ts                                 # MODIFY — scanner namespace + onProgress
└── renderer/
    ├── routes/projects/
    │   ├── ProjectDetailRoute.tsx             # MODIFY — tab structure
    │   ├── ProjectOverviewTab.tsx             # MODIFY — show detected stack
    │   └── ProjectScanTab.tsx                 # NEW — scan button + history + file inventory
    └── features/projects/
        ├── useScans.ts                        # NEW — scan query/mutation hooks
        └── ScanProgressBar.tsx                # NEW

drizzle/
└── 0001_scanner_tables.sql                    # NEW — generated migration

tests/
├── main/
│   ├── scanner-walker.test.ts                 # NEW
│   ├── scanner-classify.test.ts               # NEW
│   ├── scanner-detectors.test.ts              # NEW
│   ├── scanner-env-vars.test.ts               # NEW
│   └── scanner-end-to-end.test.ts             # NEW
└── fixtures/scanner/
    ├── nextjs-supabase/                       # NEW fixture project
    ├── react-vite/                            # NEW
    └── python-fastapi/                        # NEW
```

---

## Task 1: Extend Drizzle schema with scan + file tables

**Files:**
- Modify: `E:\Projects\VibeOps\src\main\db\schema.ts`

- [ ] **Step 1: Append tables**

Add to bottom of `src/main/db/schema.ts`:

```ts
import { integer } from 'drizzle-orm/sqlite-core';

export const projectScans = sqliteTable('project_scans', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  summary: text('summary'),
  detectedStack: text('detected_stack'),
  detectedFrameworks: text('detected_frameworks').notNull().default('[]'),
  detectedPackageManager: text('detected_package_manager'),
  detectedDatabase: text('detected_database'),
  detectedAuth: text('detected_auth'),
  detectedDeployment: text('detected_deployment'),
  warnings: text('warnings').notNull().default('[]'),
  fileCount: integer('file_count').notNull().default(0),
  byteCount: integer('byte_count').notNull().default(0),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  errorMessage: text('error_message')
});

export const projectFiles = sqliteTable('project_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id').notNull().references(() => projectScans.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  fileType: text('file_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  hash: text('hash'),
  importanceScore: integer('importance_score').notNull().default(0),
  summary: text('summary'),
  lastSeenAt: text('last_seen_at').notNull()
});

export const projectEnvVars = sqliteTable('project_env_vars', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id').notNull().references(() => projectScans.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  variable: text('variable').notNull(),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
  comment: text('comment')
});

export type ProjectScanRow = typeof projectScans.$inferSelect;
export type ProjectFileRow = typeof projectFiles.$inferSelect;
export type ProjectEnvVarRow = typeof projectEnvVars.$inferSelect;
```

> **Note:** PRD §22 schema uses simpler `last_seen_at` semantics. We add `scan_id` so we can keep an audit trail of file inventories per scan and support diffing in V1.x without a migration.

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: file `drizzle/0001_*.sql` created. Inspect it — it must include three CREATE TABLE statements for `project_scans`, `project_files`, `project_env_vars` with foreign keys.

- [ ] **Step 3: Add helpful indexes**

Edit the generated `drizzle/0001_*.sql` and append:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_files_scan_path
  ON project_files (project_id, scan_id, path);
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files (project_id);
CREATE INDEX IF NOT EXISTS idx_project_scans_project ON project_scans (project_id);
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/schema.ts drizzle/0001_*.sql
git commit -m "feat(db): scanner tables — project_scans, project_files, project_env_vars"
```

---

## Task 2: Shared types + IPC channels for scanning

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`
- Create: `E:\Projects\VibeOps\src\shared\scan-events.ts`

- [ ] **Step 1: Append to `src/shared/types.ts`**

```ts
export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type FileType =
  | 'source'
  | 'config'
  | 'doc'
  | 'lock'
  | 'env-example'
  | 'env-secret'
  | 'binary'
  | 'asset'
  | 'test'
  | 'unknown';

export interface DetectionResult {
  projectType: string | null;
  packageManager: string | null;
  frameworks: string[];
  database: string | null;
  auth: string | null;
  deployment: string | null;
  primaryStack: string | null;
}

export interface ScanWarning {
  code: string;
  message: string;
  filePath?: string;
}

export interface Scan {
  id: string;
  projectId: string;
  status: ScanStatus;
  summary: string | null;
  detection: DetectionResult;
  warnings: ScanWarning[];
  fileCount: number;
  byteCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ScanFile {
  id: string;
  projectId: string;
  scanId: string;
  path: string;
  fileType: FileType;
  sizeBytes: number;
  hash: string | null;
  importanceScore: number;
  summary: string | null;
  lastSeenAt: string;
}

export interface ScanEnvVar {
  id: string;
  projectId: string;
  scanId: string;
  filename: string;
  variable: string;
  required: boolean;
  comment: string | null;
}
```

- [ ] **Step 2: Replace `src/shared/ipc-channels.ts`**

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
  scanProgress: 'scan:progress'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
```

- [ ] **Step 3: Write `src/shared/scan-events.ts`**

```ts
export type ScanProgressStage =
  | 'walking'
  | 'classifying'
  | 'detecting'
  | 'persisting'
  | 'summarizing'
  | 'completed'
  | 'failed';

export interface ScanProgressEvent {
  scanId: string;
  projectId: string;
  stage: ScanProgressStage;
  filesSeen: number;
  filesPersisted: number;
  bytesSeen: number;
  message?: string;
  errorMessage?: string;
}
```

- [ ] **Step 4: Verify ipc-channels test**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass — uniqueness still holds.

- [ ] **Step 5: Commit**

```bash
git add src/shared
git commit -m "feat(shared): scan types, channels, and progress event"
```

---

## Task 3: Default ignore rules

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\ignore-rules.ts`

- [ ] **Step 1: Add deps**

Run: `pnpm add ignore fast-glob dotenv`
Expected: success.

- [ ] **Step 2: Write `src/main/scanner/ignore-rules.ts`**

```ts
import ignore, { type Ignore } from 'ignore';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_IGNORES: readonly string[] = [
  'node_modules/',
  '.git/',
  '.next/',
  '.turbo/',
  '.cache/',
  '.vercel/',
  '.netlify/',
  'dist/',
  'build/',
  'coverage/',
  'out/',
  'release/',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.*.local',
  '*.pem',
  '*.key',
  '*.pfx',
  '*.sqlite',
  '*.sqlite-journal',
  '*.db',
  '*.db-journal',
  '*.log',
  'storybook-static/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.tox/',
  '.mypy_cache/',
  '.pytest_cache/',
  '.gradle/',
  'target/'
];

const SECRET_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test'
]);

export function isSecretFilename(p: string): boolean {
  const base = path.basename(p);
  if (SECRET_FILENAMES.has(base)) return true;
  if (/^\.env\.[^.]+\.local$/.test(base)) return true;
  return false;
}

export function isEnvExample(p: string): boolean {
  const base = path.basename(p);
  return base === '.env.example' || base === '.env.local.example' || base === '.env.sample';
}

export function buildIgnore(rootDir: string, extras: readonly string[] = []): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES.slice());

  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(content);
    } catch {
      // fallback to defaults
    }
  }

  if (extras.length > 0) ig.add(extras.slice());
  return ig;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/scanner/ignore-rules.ts package.json pnpm-lock.yaml
git commit -m "feat(scanner): default ignore rules and secret-filename helpers"
```

---

## Task 4: Walker (fast-glob with ignore filter)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\walker.ts`
- Create: `E:\Projects\VibeOps\tests\main\scanner-walker.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/scanner-walker.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { walkProject } from '@main/scanner/walker';

const fixtureRoot = path.resolve('tests/fixtures/scanner/react-vite');

beforeAll(() => {
  const files: Array<[string, string]> = [
    ['package.json', JSON.stringify({ name: 'demo', dependencies: { react: '^18.0.0' }, devDependencies: { vite: '^5.0.0' } })],
    ['vite.config.ts', 'export default {}'],
    ['src/main.tsx', 'console.log("hi")'],
    ['src/components/App.tsx', 'export const App = () => null;'],
    ['README.md', '# demo'],
    ['.env.example', '# example\nAPI_URL=https://example.test\n'],
    ['.env', 'SECRET=do_not_read_me\n'],
    ['node_modules/foo/index.js', '// huge dep'],
    ['dist/main.js', '// build output'],
    ['.gitignore', 'dist\n']
  ];
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const p = path.join(fixtureRoot, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
});

describe('walkProject', () => {
  it('walks the tree honoring default ignores', async () => {
    const result = await walkProject(fixtureRoot);
    const rel = result.files.map((f) => f.relativePath.replace(/\\/g, '/'));
    expect(rel).toContain('package.json');
    expect(rel).toContain('vite.config.ts');
    expect(rel).toContain('src/main.tsx');
    expect(rel).toContain('.env.example');
    expect(rel).not.toContain('.env');
    expect(rel).not.toContain('node_modules/foo/index.js');
    expect(rel).not.toContain('dist/main.js');
  });

  it('records totals', async () => {
    const result = await walkProject(fixtureRoot);
    expect(result.totalFiles).toBe(result.files.length);
    expect(result.totalBytes).toBeGreaterThan(0);
  });

  it('flags secret env file in warnings, but does NOT include it in files', async () => {
    const result = await walkProject(fixtureRoot);
    expect(result.warnings.some((w) => w.code === 'SECRET_FILE_PRESENT')).toBe(true);
    expect(result.files.some((f) => f.relativePath === '.env')).toBe(false);
  });

  it('caps per-file size and reports oversize as warning', async () => {
    const big = path.join(fixtureRoot, 'big-binary.bin');
    fs.writeFileSync(big, Buffer.alloc(60_000_000));
    const result = await walkProject(fixtureRoot);
    const file = result.files.find((f) => f.relativePath === 'big-binary.bin');
    expect(file).toBeDefined();
    expect(file?.skippedReason ?? null).toBe('TOO_LARGE');
    fs.rmSync(big);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/scanner-walker.test.ts`
Expected: FAIL — walker module missing.

- [ ] **Step 3: Write `src/main/scanner/walker.ts`**

```ts
import fg from 'fast-glob';
import fs from 'node:fs';
import path from 'node:path';
import type { ScanWarning } from '@shared/types';
import { buildIgnore, isSecretFilename } from './ignore-rules';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface WalkedFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  isSymbolicLink: boolean;
  skippedReason: 'TOO_LARGE' | null;
}

export interface WalkResult {
  files: WalkedFile[];
  warnings: ScanWarning[];
  totalFiles: number;
  totalBytes: number;
}

export interface WalkOptions {
  extraIgnore?: string[];
  signal?: AbortSignal;
}

export async function walkProject(rootDir: string, opts: WalkOptions = {}): Promise<WalkResult> {
  const root = path.resolve(rootDir);
  const ig = buildIgnore(root, opts.extraIgnore ?? []);
  const warnings: ScanWarning[] = [];

  const entries = await fg(['**/*'], {
    cwd: root,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    stats: true
  });

  let totalBytes = 0;
  const files: WalkedFile[] = [];

  for (const entry of entries) {
    if (opts.signal?.aborted) throw new Error('SCAN_CANCELED');
    const stats = entry.stats!;
    const rel = entry.path.replace(/\\/g, '/');
    if (stats.isDirectory()) continue;
    if (ig.ignores(rel)) {
      if (isSecretFilename(rel)) {
        warnings.push({
          code: 'SECRET_FILE_PRESENT',
          message: `Found secret-like file: ${rel} (contents not read)`,
          filePath: rel
        });
      }
      continue;
    }
    if (stats.isSymbolicLink()) {
      warnings.push({
        code: 'SYMLINK_SKIPPED',
        message: `Symlink not followed: ${rel}`,
        filePath: rel
      });
      continue;
    }
    const sizeBytes = stats.size ?? 0;
    const skippedReason = sizeBytes > MAX_FILE_BYTES ? 'TOO_LARGE' : null;
    if (skippedReason) {
      warnings.push({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds ${MAX_FILE_BYTES} bytes — metadata only: ${rel}`,
        filePath: rel
      });
    }
    totalBytes += sizeBytes;
    files.push({
      relativePath: rel,
      absolutePath: path.join(root, rel),
      sizeBytes,
      isSymbolicLink: false,
      skippedReason
    });
  }

  return { files, warnings, totalFiles: files.length, totalBytes };
}

export function safeReadText(absPath: string, maxBytes = 256 * 1024): string | null {
  try {
    const stats = fs.statSync(absPath);
    if (stats.size > maxBytes) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/scanner-walker.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/walker.ts tests/main/scanner-walker.test.ts tests/fixtures/scanner/react-vite
git commit -m "feat(scanner): tree walker with ignore rules and secret-file warnings"
```

---

## Task 5: File classification + importance scoring

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\classify.ts`
- Create: `E:\Projects\VibeOps\tests\main\scanner-classify.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/scanner-classify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classifyFile, importanceScore } from '@main/scanner/classify';

describe('classifyFile', () => {
  it('detects source files', () => {
    expect(classifyFile('src/index.ts')).toBe('source');
    expect(classifyFile('app/page.tsx')).toBe('source');
    expect(classifyFile('main.py')).toBe('source');
  });
  it('detects config', () => {
    expect(classifyFile('next.config.js')).toBe('config');
    expect(classifyFile('vite.config.ts')).toBe('config');
    expect(classifyFile('package.json')).toBe('config');
    expect(classifyFile('docker-compose.yml')).toBe('config');
  });
  it('detects locks', () => {
    expect(classifyFile('pnpm-lock.yaml')).toBe('lock');
    expect(classifyFile('package-lock.json')).toBe('lock');
    expect(classifyFile('yarn.lock')).toBe('lock');
  });
  it('detects docs', () => {
    expect(classifyFile('README.md')).toBe('doc');
    expect(classifyFile('docs/architecture.md')).toBe('doc');
    expect(classifyFile('CLAUDE.md')).toBe('doc');
  });
  it('detects env-example vs env-secret', () => {
    expect(classifyFile('.env.example')).toBe('env-example');
    expect(classifyFile('.env.local.example')).toBe('env-example');
    expect(classifyFile('.env')).toBe('env-secret');
    expect(classifyFile('.env.production')).toBe('env-secret');
  });
  it('detects tests', () => {
    expect(classifyFile('tests/foo.test.ts')).toBe('test');
    expect(classifyFile('src/foo.spec.tsx')).toBe('test');
    expect(classifyFile('test_main.py')).toBe('test');
  });
  it('detects assets', () => {
    expect(classifyFile('public/logo.svg')).toBe('asset');
    expect(classifyFile('assets/hero.png')).toBe('asset');
  });
  it('falls back to unknown', () => {
    expect(classifyFile('weirdfile.xyz')).toBe('unknown');
  });
});

describe('importanceScore', () => {
  it('scores top-level package.json highest', () => {
    expect(importanceScore('package.json')).toBeGreaterThan(importanceScore('src/index.ts'));
  });
  it('scores README highly', () => {
    expect(importanceScore('README.md')).toBeGreaterThanOrEqual(80);
  });
  it('scores schema/migrations highly', () => {
    expect(importanceScore('prisma/schema.prisma')).toBeGreaterThanOrEqual(85);
    expect(importanceScore('supabase/migrations/0001_init.sql')).toBeGreaterThanOrEqual(80);
  });
  it('scores deeply nested generated-looking files low', () => {
    expect(importanceScore('src/__generated__/schema.ts')).toBeLessThanOrEqual(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/scanner-classify.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/scanner/classify.ts`**

```ts
import path from 'node:path';
import type { FileType } from '@shared/types';
import { isEnvExample, isSecretFilename } from './ignore-rules';

const SOURCE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.php', '.java', '.kt', '.swift',
  '.cs', '.cpp', '.c', '.h', '.hpp', '.scala', '.dart', '.lua', '.sql', '.sh', '.ps1'
]);

const CONFIG_BASENAMES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.ts', 'vite.config.js',
  'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs',
  'postcss.config.js', 'postcss.config.cjs',
  'astro.config.mjs', 'astro.config.ts',
  'svelte.config.js',
  'remix.config.js',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'vercel.json', 'netlify.toml', 'render.yaml', 'fly.toml',
  'pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py', 'setup.cfg',
  'Cargo.toml', 'go.mod', 'go.sum',
  'tauri.conf.json',
  'electron-builder.yml', 'electron-builder.yaml',
  'drizzle.config.ts', 'drizzle.config.js'
]);

const LOCK_BASENAMES = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
  'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum'
]);

const DOC_BASENAMES = new Set([
  'README.md', 'README.MD', 'readme.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'LICENSE', 'LICENSE.md', 'CLAUDE.md', 'AGENTS.md', 'memory.md', 'MEMORY.md'
]);

const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mp3', '.wav']);
const BINARY_EXT = new Set(['.dll', '.bin', '.dat', '.zip', '.tar', '.gz', '.7z']);

const GENERATED_HINTS = ['__generated__', '/generated/', '.generated.', '.gen.'];

const HEAD_CONFIGS = new Set([
  'next.config.js', 'next.config.ts', 'vite.config.ts', 'vite.config.js',
  'tailwind.config.cjs', 'tailwind.config.ts', 'tsconfig.json',
  'docker-compose.yml', 'Dockerfile', 'vercel.json', 'netlify.toml',
  'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'tauri.conf.json', 'electron-builder.yml'
]);

export function classifyFile(relPath: string): FileType {
  const norm = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(norm);
  const ext = path.posix.extname(norm).toLowerCase();

  if (isEnvExample(norm)) return 'env-example';
  if (isSecretFilename(norm)) return 'env-secret';
  if (LOCK_BASENAMES.has(base)) return 'lock';
  if (CONFIG_BASENAMES.has(base)) return 'config';
  if (DOC_BASENAMES.has(base) || (ext === '.md' && norm.startsWith('docs/'))) return 'doc';

  if (/\.(test|spec)\.(t|j)sx?$/.test(base)) return 'test';
  if (/^test_/.test(base) && (ext === '.py' || ext === '.ts' || ext === '.js')) return 'test';
  if (norm.includes('/tests/') || norm.startsWith('tests/')) return 'test';

  if (ASSET_EXT.has(ext)) return 'asset';
  if (BINARY_EXT.has(ext)) return 'binary';
  if (SOURCE_EXT.has(ext)) return 'source';

  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') return 'config';
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.rst') return 'doc';
  return 'unknown';
}

export function importanceScore(relPath: string): number {
  const norm = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(norm);
  const depth = norm.split('/').length - 1;
  let score = 50 - Math.min(depth * 4, 30);

  if (base === 'package.json' && depth === 0) score = 100;
  else if (base === 'README.md' && depth === 0) score = Math.max(score, 90);
  else if (base === 'memory.md' && depth === 0) score = Math.max(score, 95);
  else if (norm === 'CLAUDE.md' || norm === 'AGENTS.md') score = Math.max(score, 85);
  else if (HEAD_CONFIGS.has(base) && depth <= 1) score = Math.max(score, 80);
  else if (norm.includes('schema.prisma')) score = Math.max(score, 90);
  else if (norm.includes('supabase/migrations/')) score = Math.max(score, 80);
  else if (norm.includes('schema.sql')) score = Math.max(score, 80);

  if (GENERATED_HINTS.some((h) => norm.includes(h))) score = Math.min(score, 20);

  return Math.max(0, Math.min(100, score));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/scanner-classify.test.ts`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/classify.ts tests/main/scanner-classify.test.ts
git commit -m "feat(scanner): file type classification and importance scoring"
```

---

## Task 6: Detectors — package manager, frameworks, db, auth, deployment

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\package-manager.ts`
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\frameworks.ts`
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\database.ts`
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\auth.ts`
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\deployment.ts`
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\index.ts`
- Create: `E:\Projects\VibeOps\tests\main\scanner-detectors.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/scanner-detectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectAll, type DetectorContext } from '@main/scanner/detectors';

function ctx(over: Partial<DetectorContext> = {}): DetectorContext {
  return {
    rootDir: '/fake',
    files: [],
    readText: () => null,
    ...over
  } as DetectorContext;
}

describe('detectAll', () => {
  it('detects pnpm via lockfile', () => {
    const r = detectAll(ctx({ files: ['pnpm-lock.yaml', 'package.json'] }));
    expect(r.packageManager).toBe('pnpm');
  });
  it('detects yarn via lockfile', () => {
    const r = detectAll(ctx({ files: ['yarn.lock', 'package.json'] }));
    expect(r.packageManager).toBe('yarn');
  });
  it('detects npm via package-lock.json', () => {
    const r = detectAll(ctx({ files: ['package-lock.json', 'package.json'] }));
    expect(r.packageManager).toBe('npm');
  });
  it('detects pip via requirements.txt', () => {
    const r = detectAll(ctx({ files: ['requirements.txt'] }));
    expect(r.packageManager).toBe('pip');
  });
  it('detects Next.js via next.config + dep', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'next.config.js', 'app/page.tsx'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { next: '14.0.0' } }) : null
    }));
    expect(r.frameworks).toContain('Next.js');
    expect(r.frameworks).toContain('React');
    expect(r.projectType).toBe('Next.js Application');
  });
  it('detects Vite + React', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'vite.config.ts', 'src/main.tsx'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { react: '^18' }, devDependencies: { vite: '^5' } }) : null
    }));
    expect(r.frameworks).toContain('Vite');
    expect(r.frameworks).toContain('React');
  });
  it('detects FastAPI', () => {
    const r = detectAll(ctx({
      files: ['pyproject.toml', 'main.py', 'requirements.txt'],
      readText: (p) => p === 'requirements.txt' ? 'fastapi==0.110\nuvicorn==0.30' : null
    }));
    expect(r.frameworks).toContain('FastAPI');
    expect(r.projectType).toContain('FastAPI');
  });
  it('detects Supabase + Postgres + Supabase Auth', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'supabase/config.toml', 'supabase/migrations/0001_init.sql'],
      readText: (p) =>
        p === 'package.json' ? JSON.stringify({ dependencies: { '@supabase/supabase-js': '^2' } }) : null
    }));
    expect(r.database).toBe('Supabase Postgres');
    expect(r.auth).toBe('Supabase Auth');
  });
  it('detects Prisma + Postgres', () => {
    const r = detectAll(ctx({
      files: ['prisma/schema.prisma'],
      readText: (p) => p === 'prisma/schema.prisma' ? 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }' : null
    }));
    expect(r.database).toBe('Prisma + PostgreSQL');
  });
  it('detects Vercel', () => {
    const r = detectAll(ctx({ files: ['vercel.json', 'package.json'] }));
    expect(r.deployment).toBe('Vercel');
  });
  it('detects Netlify', () => {
    const r = detectAll(ctx({ files: ['netlify.toml'] }));
    expect(r.deployment).toBe('Netlify');
  });
  it('detects Docker Compose', () => {
    const r = detectAll(ctx({ files: ['docker-compose.yml'] }));
    expect(r.deployment).toBe('Docker Compose');
  });
  it('falls back to nulls when nothing detected', () => {
    const r = detectAll(ctx({ files: ['random.txt'] }));
    expect(r.packageManager).toBeNull();
    expect(r.frameworks).toEqual([]);
    expect(r.database).toBeNull();
  });
  it('builds primaryStack short label', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'next.config.js'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { next: '14', react: '18' } }) : null
    }));
    expect(r.primaryStack).toBe('Next.js + React');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/scanner-detectors.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `package-manager.ts`**

```ts
import type { DetectorContext } from './index';

export function detectPackageManager(ctx: DetectorContext): string | null {
  const has = (f: string) => ctx.files.includes(f);
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  if (has('package-lock.json')) return 'npm';
  if (has('package.json')) return 'npm';
  if (has('poetry.lock') || ctx.files.includes('pyproject.toml')) return 'poetry';
  if (has('Pipfile.lock') || has('Pipfile')) return 'pipenv';
  if (has('requirements.txt')) return 'pip';
  if (has('Cargo.toml')) return 'cargo';
  if (has('go.mod')) return 'go modules';
  return null;
}
```

- [ ] **Step 4: Write `frameworks.ts`**

```ts
import type { DetectorContext } from './index';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkg(ctx: DetectorContext): PackageJson | null {
  const text = ctx.readText('package.json');
  if (!text) return null;
  try { return JSON.parse(text) as PackageJson; } catch { return null; }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectFrameworks(ctx: DetectorContext): { frameworks: string[]; projectType: string | null } {
  const f = new Set<string>();
  const has = (p: string) => ctx.files.includes(p);
  const pkg = parsePkg(ctx);

  if (hasDep(pkg, 'next') || ctx.files.some((p) => /^next\.config\.(js|ts|mjs|cjs)$/.test(p))) f.add('Next.js');
  if (hasDep(pkg, 'react')) f.add('React');
  if (hasDep(pkg, 'vue')) f.add('Vue');
  if (hasDep(pkg, 'svelte')) f.add('Svelte');
  if (hasDep(pkg, 'astro') || ctx.files.some((p) => p.startsWith('astro.config.'))) f.add('Astro');
  if (hasDep(pkg, 'remix') || hasDep(pkg, '@remix-run/react')) f.add('Remix');
  if (hasDep(pkg, 'expo')) f.add('Expo');
  if (hasDep(pkg, 'react-native')) f.add('React Native');
  if (hasDep(pkg, 'electron') || has('electron-builder.yml')) f.add('Electron');
  if (hasDep(pkg, 'vite') || ctx.files.some((p) => p.startsWith('vite.config.'))) f.add('Vite');
  if (hasDep(pkg, 'tailwindcss') || ctx.files.some((p) => p.startsWith('tailwind.config.'))) f.add('Tailwind CSS');
  if (has('tauri.conf.json')) f.add('Tauri');
  if (hasDep(pkg, 'drizzle-orm')) f.add('Drizzle ORM');
  if (hasDep(pkg, '@prisma/client') || has('prisma/schema.prisma')) f.add('Prisma');

  const reqs = ctx.readText('requirements.txt') ?? '';
  const pyproject = ctx.readText('pyproject.toml') ?? '';
  if (/(^|\n)\s*fastapi\b/i.test(reqs) || /fastapi/i.test(pyproject)) f.add('FastAPI');
  if (/(^|\n)\s*django\b/i.test(reqs) || /django/i.test(pyproject)) f.add('Django');
  if (/(^|\n)\s*flask\b/i.test(reqs) || /flask/i.test(pyproject)) f.add('Flask');

  let projectType: string | null = null;
  if (f.has('Next.js')) projectType = 'Next.js Application';
  else if (f.has('Remix')) projectType = 'Remix Application';
  else if (f.has('Astro')) projectType = 'Astro Site';
  else if (f.has('Expo')) projectType = 'Expo / React Native App';
  else if (f.has('React Native')) projectType = 'React Native App';
  else if (f.has('Electron')) projectType = 'Electron Desktop App';
  else if (f.has('Tauri')) projectType = 'Tauri Desktop App';
  else if (f.has('Vite') && f.has('React')) projectType = 'React + Vite SPA';
  else if (f.has('FastAPI')) projectType = 'FastAPI Service';
  else if (f.has('Django')) projectType = 'Django Application';
  else if (f.has('Flask')) projectType = 'Flask Application';

  return { frameworks: Array.from(f), projectType };
}
```

- [ ] **Step 5: Write `database.ts`**

```ts
import type { DetectorContext } from './index';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkg(ctx: DetectorContext): PackageJson | null {
  const text = ctx.readText('package.json');
  if (!text) return null;
  try { return JSON.parse(text) as PackageJson; } catch { return null; }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectDatabase(ctx: DetectorContext): string | null {
  const has = (p: string) => ctx.files.includes(p);
  const pkg = parsePkg(ctx);

  if (has('supabase/config.toml') || hasDep(pkg, '@supabase/supabase-js')) return 'Supabase Postgres';

  if (has('prisma/schema.prisma')) {
    const schema = ctx.readText('prisma/schema.prisma') ?? '';
    if (/provider\s*=\s*"postgresql"/.test(schema)) return 'Prisma + PostgreSQL';
    if (/provider\s*=\s*"mysql"/.test(schema)) return 'Prisma + MySQL';
    if (/provider\s*=\s*"sqlite"/.test(schema)) return 'Prisma + SQLite';
    return 'Prisma';
  }
  if (hasDep(pkg, 'drizzle-orm')) {
    if (hasDep(pkg, 'better-sqlite3') || hasDep(pkg, '@libsql/client')) return 'Drizzle + SQLite';
    if (hasDep(pkg, 'pg') || hasDep(pkg, 'postgres')) return 'Drizzle + PostgreSQL';
    return 'Drizzle ORM';
  }
  if (hasDep(pkg, 'mongoose') || hasDep(pkg, 'mongodb')) return 'MongoDB';
  if (hasDep(pkg, 'firebase') || hasDep(pkg, 'firebase-admin')) return 'Firebase / Firestore';
  if (hasDep(pkg, 'redis') || hasDep(pkg, 'ioredis')) return 'Redis';
  if (has('schema.sql')) return 'SQL (schema.sql present)';
  return null;
}
```

- [ ] **Step 6: Write `auth.ts`**

```ts
import type { DetectorContext } from './index';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkg(ctx: DetectorContext): PackageJson | null {
  const text = ctx.readText('package.json');
  if (!text) return null;
  try { return JSON.parse(text) as PackageJson; } catch { return null; }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectAuth(ctx: DetectorContext): string | null {
  const pkg = parsePkg(ctx);
  if (ctx.files.includes('supabase/config.toml') || hasDep(pkg, '@supabase/supabase-js')) return 'Supabase Auth';
  if (hasDep(pkg, 'next-auth')) return 'NextAuth';
  if (hasDep(pkg, '@clerk/nextjs') || hasDep(pkg, '@clerk/clerk-sdk-node')) return 'Clerk';
  if (hasDep(pkg, '@auth0/nextjs-auth0') || hasDep(pkg, 'auth0')) return 'Auth0';
  if (hasDep(pkg, 'firebase')) return 'Firebase Auth';
  if (hasDep(pkg, 'lucia')) return 'Lucia Auth';
  if (hasDep(pkg, 'better-auth')) return 'Better Auth';
  return null;
}
```

- [ ] **Step 7: Write `deployment.ts`**

```ts
import type { DetectorContext } from './index';

export function detectDeployment(ctx: DetectorContext): string | null {
  const has = (p: string) => ctx.files.includes(p);
  if (has('vercel.json')) return 'Vercel';
  if (has('netlify.toml')) return 'Netlify';
  if (has('render.yaml')) return 'Render';
  if (has('fly.toml')) return 'Fly.io';
  if (has('docker-compose.yml') || has('docker-compose.yaml')) return 'Docker Compose';
  if (has('Dockerfile')) return 'Docker';
  if (has('.github/workflows/deploy.yml') || has('.github/workflows/deploy.yaml')) return 'GitHub Actions deploy';
  return null;
}
```

- [ ] **Step 8: Write `detectors/index.ts`**

```ts
import type { DetectionResult } from '@shared/types';
import { detectPackageManager } from './package-manager';
import { detectFrameworks } from './frameworks';
import { detectDatabase } from './database';
import { detectAuth } from './auth';
import { detectDeployment } from './deployment';

export interface DetectorContext {
  rootDir: string;
  files: string[];
  readText: (relPath: string) => string | null;
}

export function detectAll(ctx: DetectorContext): DetectionResult {
  const packageManager = detectPackageManager(ctx);
  const { frameworks, projectType } = detectFrameworks(ctx);
  const database = detectDatabase(ctx);
  const auth = detectAuth(ctx);
  const deployment = detectDeployment(ctx);

  let primaryStack: string | null = null;
  if (frameworks.includes('Next.js')) primaryStack = 'Next.js + React';
  else if (frameworks.includes('Remix')) primaryStack = 'Remix';
  else if (frameworks.includes('Vite') && frameworks.includes('React')) primaryStack = 'React + Vite';
  else if (frameworks.includes('Expo')) primaryStack = 'Expo / React Native';
  else if (frameworks.includes('Electron')) primaryStack = 'Electron';
  else if (frameworks.includes('FastAPI')) primaryStack = 'Python · FastAPI';
  else if (frameworks.includes('Django')) primaryStack = 'Python · Django';
  else if (frameworks.length > 0) primaryStack = frameworks[0] ?? null;

  return { projectType, packageManager, frameworks, database, auth, deployment, primaryStack };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm test -- tests/main/scanner-detectors.test.ts`
Expected: 14 tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/main/scanner/detectors tests/main/scanner-detectors.test.ts
git commit -m "feat(scanner): detectors for package mgr, frameworks, db, auth, deployment"
```

---

## Task 7: Env-var name extractor (no values)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\detectors\env-vars.ts`
- Create: `E:\Projects\VibeOps\tests\main\scanner-env-vars.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/scanner-env-vars.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractEnvVarNames } from '@main/scanner/detectors/env-vars';

describe('extractEnvVarNames', () => {
  it('extracts variable names without storing values', () => {
    const out = extractEnvVarNames('.env.example', `
# Example env
DATABASE_URL=postgres://example
API_KEY="real-looking-but-example"
EMPTY=
NEXT_PUBLIC_FEATURE_FLAG=true
# Trailing comment
`);
    expect(out.map((v) => v.variable).sort()).toEqual(
      ['API_KEY', 'DATABASE_URL', 'EMPTY', 'NEXT_PUBLIC_FEATURE_FLAG'].sort()
    );
    for (const v of out) {
      expect(v).not.toHaveProperty('value');
    }
  });
  it('captures comments above a variable as the comment field', () => {
    const out = extractEnvVarNames('.env.example', `
# Stripe key for billing
STRIPE_SECRET_KEY=sk_test
`);
    expect(out[0]?.variable).toBe('STRIPE_SECRET_KEY');
    expect(out[0]?.comment).toBe('Stripe key for billing');
  });
  it('marks NEXT_PUBLIC_ as not required by default', () => {
    const out = extractEnvVarNames('.env.example', 'NEXT_PUBLIC_X=1\nDB_URL=2\n');
    expect(out.find((v) => v.variable === 'NEXT_PUBLIC_X')?.required).toBe(false);
    expect(out.find((v) => v.variable === 'DB_URL')?.required).toBe(true);
  });
  it('skips obvious non-key lines', () => {
    const out = extractEnvVarNames('.env.example', 'this is not a key\n=alone\nlowercase=ignored\n');
    expect(out.map((v) => v.variable)).not.toContain('lowercase');
    expect(out.map((v) => v.variable)).not.toContain('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/scanner-env-vars.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/scanner/detectors/env-vars.ts`**

```ts
export interface ExtractedEnvVar {
  filename: string;
  variable: string;
  required: boolean;
  comment: string | null;
}

const KEY_RE = /^([A-Z][A-Z0-9_]*)\s*=/;

export function extractEnvVarNames(filename: string, content: string): ExtractedEnvVar[] {
  const out: ExtractedEnvVar[] = [];
  const lines = content.split(/\r?\n/);
  let pendingComment: string | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      pendingComment = null;
      continue;
    }
    if (trimmed.startsWith('#')) {
      pendingComment = trimmed.replace(/^#+\s?/, '').trim() || null;
      continue;
    }
    const m = KEY_RE.exec(trimmed);
    if (!m) {
      pendingComment = null;
      continue;
    }
    const variable = m[1]!;
    const required = !variable.startsWith('NEXT_PUBLIC_') && !variable.startsWith('VITE_');
    out.push({ filename, variable, required, comment: pendingComment });
    pendingComment = null;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/scanner-env-vars.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/scanner/detectors/env-vars.ts tests/main/scanner-env-vars.test.ts
git commit -m "feat(scanner): .env.example variable name extractor (names only)"
```

---

## Task 8: Scan repository (persistence)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\repo.ts`

- [ ] **Step 1: Write the file**

```ts
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projectScans, projectFiles, projectEnvVars, type ProjectScanRow, type ProjectFileRow, type ProjectEnvVarRow } from '@main/db/schema';
import type { Scan, ScanFile, ScanEnvVar, ScanStatus, ScanWarning, DetectionResult } from '@shared/types';

function rowToScan(row: ProjectScanRow): Scan {
  let frameworks: string[] = [];
  let warnings: ScanWarning[] = [];
  try { frameworks = JSON.parse(row.detectedFrameworks); } catch { frameworks = []; }
  try { warnings = JSON.parse(row.warnings); } catch { warnings = []; }
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as ScanStatus,
    summary: row.summary,
    detection: {
      projectType: null,
      packageManager: row.detectedPackageManager,
      frameworks,
      database: row.detectedDatabase,
      auth: row.detectedAuth,
      deployment: row.detectedDeployment,
      primaryStack: row.detectedStack
    },
    warnings,
    fileCount: row.fileCount,
    byteCount: row.byteCount,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage
  };
}

function rowToFile(row: ProjectFileRow): ScanFile {
  return {
    id: row.id,
    projectId: row.projectId,
    scanId: row.scanId,
    path: row.path,
    fileType: row.fileType as ScanFile['fileType'],
    sizeBytes: row.sizeBytes,
    hash: row.hash,
    importanceScore: row.importanceScore,
    summary: row.summary,
    lastSeenAt: row.lastSeenAt
  };
}

function rowToEnv(row: ProjectEnvVarRow): ScanEnvVar {
  return {
    id: row.id,
    projectId: row.projectId,
    scanId: row.scanId,
    filename: row.filename,
    variable: row.variable,
    required: row.required,
    comment: row.comment
  };
}

export interface InsertScanArgs {
  id: string;
  projectId: string;
  startedAt: string;
}

export interface CompleteScanArgs {
  id: string;
  status: ScanStatus;
  summary: string | null;
  detection: DetectionResult;
  warnings: ScanWarning[];
  fileCount: number;
  byteCount: number;
  completedAt: string;
  errorMessage?: string | null;
}

export class ScansRepo {
  constructor(private readonly db: Db) {}

  start(args: InsertScanArgs): void {
    this.db.insert(projectScans).values({
      id: args.id,
      projectId: args.projectId,
      status: 'running',
      summary: null,
      detectedStack: null,
      detectedFrameworks: '[]',
      detectedPackageManager: null,
      detectedDatabase: null,
      detectedAuth: null,
      detectedDeployment: null,
      warnings: '[]',
      fileCount: 0,
      byteCount: 0,
      startedAt: args.startedAt,
      completedAt: null,
      errorMessage: null
    }).run();
  }

  complete(args: CompleteScanArgs): void {
    this.db.update(projectScans).set({
      status: args.status,
      summary: args.summary,
      detectedStack: args.detection.primaryStack,
      detectedFrameworks: JSON.stringify(args.detection.frameworks),
      detectedPackageManager: args.detection.packageManager,
      detectedDatabase: args.detection.database,
      detectedAuth: args.detection.auth,
      detectedDeployment: args.detection.deployment,
      warnings: JSON.stringify(args.warnings),
      fileCount: args.fileCount,
      byteCount: args.byteCount,
      completedAt: args.completedAt,
      errorMessage: args.errorMessage ?? null
    }).where(eq(projectScans.id, args.id)).run();
  }

  byId(id: string): Scan | null {
    const row = this.db.select().from(projectScans).where(eq(projectScans.id, id)).get();
    return row ? rowToScan(row) : null;
  }

  listByProject(projectId: string): Scan[] {
    const rows = this.db.select().from(projectScans).where(eq(projectScans.projectId, projectId))
      .orderBy(desc(projectScans.startedAt)).all();
    return rows.map(rowToScan);
  }

  latestForProject(projectId: string): Scan | null {
    const row = this.db.select().from(projectScans)
      .where(and(eq(projectScans.projectId, projectId), eq(projectScans.status, 'completed')))
      .orderBy(desc(projectScans.completedAt)).get();
    return row ? rowToScan(row) : null;
  }

  insertFiles(rows: ProjectFileRow[]): void {
    if (rows.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      this.db.insert(projectFiles).values(rows.slice(i, i + chunkSize)).run();
    }
  }

  insertEnvVars(rows: ProjectEnvVarRow[]): void {
    if (rows.length === 0) return;
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      this.db.insert(projectEnvVars).values(rows.slice(i, i + chunkSize)).run();
    }
  }

  filesByScan(scanId: string): ScanFile[] {
    const rows = this.db.select().from(projectFiles)
      .where(eq(projectFiles.scanId, scanId))
      .orderBy(desc(projectFiles.importanceScore)).all();
    return rows.map(rowToFile);
  }

  envVarsByScan(scanId: string): ScanEnvVar[] {
    const rows = this.db.select().from(projectEnvVars).where(eq(projectEnvVars.scanId, scanId)).all();
    return rows.map(rowToEnv);
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/scanner/repo.ts
git commit -m "feat(scanner): scans/files/env-vars repository"
```

---

## Task 9: Progress emitter

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\progress.ts`

- [ ] **Step 1: Write the file**

```ts
import { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { ScanProgressEvent, ScanProgressStage } from '@shared/scan-events';

export class ProgressEmitter {
  private filesSeen = 0;
  private filesPersisted = 0;
  private bytesSeen = 0;

  constructor(
    private readonly scanId: string,
    private readonly projectId: string,
    private readonly getWindow: () => BrowserWindow | null
  ) {}

  send(stage: ScanProgressStage, message?: string, errorMessage?: string): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    const event: ScanProgressEvent = {
      scanId: this.scanId,
      projectId: this.projectId,
      stage,
      filesSeen: this.filesSeen,
      filesPersisted: this.filesPersisted,
      bytesSeen: this.bytesSeen,
      message,
      errorMessage
    };
    win.webContents.send(IpcChannels.scanProgress, event);
  }

  bump(filesSeen: number, bytesSeen: number): void {
    this.filesSeen = filesSeen;
    this.bytesSeen = bytesSeen;
  }

  bumpPersisted(persisted: number): void {
    this.filesPersisted = persisted;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/scanner/progress.ts
git commit -m "feat(scanner): progress emitter via webContents.send"
```

---

## Task 10: Summary builder

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\summary.ts`

- [ ] **Step 1: Write `src/main/scanner/summary.ts`**

```ts
import type { DetectionResult, ScanWarning } from '@shared/types';

export function buildSummary(args: {
  fileCount: number;
  byteCount: number;
  detection: DetectionResult;
  warnings: ScanWarning[];
}): string {
  const { detection, fileCount, byteCount, warnings } = args;
  const sizeMB = (byteCount / (1024 * 1024)).toFixed(1);
  const parts: string[] = [];

  if (detection.projectType) parts.push(`${detection.projectType}.`);
  if (detection.primaryStack) parts.push(`Primary stack: ${detection.primaryStack}.`);
  else if (detection.frameworks.length > 0) parts.push(`Frameworks: ${detection.frameworks.join(', ')}.`);

  if (detection.packageManager) parts.push(`Package manager: ${detection.packageManager}.`);
  if (detection.database) parts.push(`Database: ${detection.database}.`);
  if (detection.auth) parts.push(`Auth: ${detection.auth}.`);
  if (detection.deployment) parts.push(`Deployment target: ${detection.deployment}.`);

  parts.push(`Indexed ${fileCount} files (~${sizeMB} MB).`);

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} captured.`);
  }

  if (parts.length === 1 && fileCount === 0) return 'Empty project — no files indexed.';
  return parts.join(' ');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/scanner/summary.ts
git commit -m "feat(scanner): plain-English scan summary builder"
```

---

## Task 11: Scanner orchestrator (`runScan` entrypoint)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\scanner\index.ts`
- Modify: `E:\Projects\VibeOps\src\main\projects\repo.ts`
- Modify: `E:\Projects\VibeOps\src\main\projects\service.ts`

- [ ] **Step 1: Add helpers to ProjectsRepo**

In `src/main/projects/repo.ts`, add inside the class:

```ts
  markScanned(id: string, when: string): void {
    this.db.update(projects).set({ lastScannedAt: when, updatedAt: when }).where(eq(projects.id, id)).run();
  }

  setPrimaryStack(id: string, stack: string | null): void {
    this.db.update(projects).set({ primaryStack: stack, updatedAt: new Date().toISOString() }).where(eq(projects.id, id)).run();
  }
```

In `src/main/projects/service.ts`, add to the class:

```ts
  markScanned(id: string): void {
    this.repo.markScanned(id, new Date().toISOString());
  }

  setPrimaryStack(id: string, stack: string | null): void {
    this.repo.setPrimaryStack(id, stack);
  }
```

- [ ] **Step 2: Write `src/main/scanner/index.ts`**

```ts
import fs from 'node:fs';
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { walkProject, safeReadText, type WalkedFile, MAX_FILE_BYTES } from './walker';
import { classifyFile, importanceScore } from './classify';
import { detectAll, type DetectorContext } from './detectors';
import { extractEnvVarNames } from './detectors/env-vars';
import { isEnvExample } from './ignore-rules';
import { buildSummary } from './summary';
import type { ScansRepo } from './repo';
import type { ProjectsService } from '@main/projects/service';
import type { Logger } from 'pino';
import type { Scan, DetectionResult, Project } from '@shared/types';
import type { ProgressEmitter } from './progress';

const newScanId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const HASH_MAX_BYTES = 1 * 1024 * 1024;

function hashFile(absPath: string): string | null {
  try {
    const stats = fs.statSync(absPath);
    if (stats.size > HASH_MAX_BYTES) return null;
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

export interface ScanDeps {
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  logger: Logger;
}

export interface RunScanArgs {
  projectId: string;
  emitter: ProgressEmitter | null;
  signal?: AbortSignal;
}

export interface RunScanResult { scan: Scan; }

function emptyDetection(): DetectionResult {
  return { projectType: null, packageManager: null, frameworks: [], database: null, auth: null, deployment: null, primaryStack: null };
}

function buildFileRow(project: Project, scanId: string, f: WalkedFile, lastSeenAt: string) {
  const fileType = classifyFile(f.relativePath);
  const importance = importanceScore(f.relativePath);
  const hash = f.skippedReason || f.sizeBytes > HASH_MAX_BYTES ? null : hashFile(f.absolutePath);
  return {
    id: `f_${crypto.randomUUID()}`,
    projectId: project.id,
    scanId,
    path: f.relativePath,
    fileType,
    sizeBytes: f.sizeBytes,
    hash,
    importanceScore: importance,
    summary: null as string | null,
    lastSeenAt
  };
}

function buildDetectorContext(project: Project, files: WalkedFile[]): DetectorContext {
  const set = files.map((f) => f.relativePath);
  return {
    rootDir: project.localPath,
    files: set,
    readText: (rel) => {
      const file = files.find((f) => f.relativePath === rel);
      if (!file) return null;
      if (file.skippedReason || file.sizeBytes > MAX_FILE_BYTES) return null;
      return safeReadText(file.absolutePath, 256 * 1024);
    }
  };
}

function extractEnvVars(project: Project, scanId: string, files: WalkedFile[]) {
  const out: Array<{
    id: string;
    projectId: string;
    scanId: string;
    filename: string;
    variable: string;
    required: boolean;
    comment: string | null;
  }> = [];
  for (const f of files) {
    if (!isEnvExample(f.relativePath)) continue;
    const text = safeReadText(f.absolutePath, 64 * 1024);
    if (!text) continue;
    const extracted = extractEnvVarNames(f.relativePath, text);
    for (const v of extracted) {
      out.push({
        id: `ev_${crypto.randomUUID()}`,
        projectId: project.id,
        scanId,
        filename: v.filename,
        variable: v.variable,
        required: v.required,
        comment: v.comment
      });
    }
  }
  return out;
}

export async function runScan(deps: ScanDeps, args: RunScanArgs): Promise<RunScanResult> {
  const project = deps.projectsService.byId(args.projectId);
  if (!project) throw new Error(`project ${args.projectId} not found`);

  const scanId = `scn_${newScanId()}`;
  const startedAt = new Date().toISOString();
  deps.scansRepo.start({ id: scanId, projectId: project.id, startedAt });
  args.emitter?.send('walking', `Scanning ${project.localPath}…`);

  try {
    const walk = await walkProject(project.localPath, { signal: args.signal });
    args.emitter?.bump(walk.totalFiles, walk.totalBytes);
    args.emitter?.send('classifying');

    const fileRows = walk.files.map((f) => buildFileRow(project, scanId, f, startedAt));
    deps.scansRepo.insertFiles(fileRows);
    args.emitter?.bumpPersisted(fileRows.length);

    args.emitter?.send('detecting');
    const ctx = buildDetectorContext(project, walk.files);
    const detection = detectAll(ctx);

    args.emitter?.send('persisting', 'Extracting .env.example variable names…');
    const envRows = extractEnvVars(project, scanId, walk.files);
    deps.scansRepo.insertEnvVars(envRows);

    args.emitter?.send('summarizing');
    const summary = buildSummary({
      fileCount: walk.totalFiles,
      byteCount: walk.totalBytes,
      detection,
      warnings: walk.warnings
    });

    const completedAt = new Date().toISOString();
    deps.scansRepo.complete({
      id: scanId,
      status: 'completed',
      summary,
      detection,
      warnings: walk.warnings,
      fileCount: walk.totalFiles,
      byteCount: walk.totalBytes,
      completedAt
    });

    deps.projectsService.markScanned(project.id);
    deps.projectsService.setPrimaryStack(project.id, detection.primaryStack);

    args.emitter?.send('completed', summary);
    deps.logger.info({ scanId, projectId: project.id, fileCount: walk.totalFiles }, 'scan completed');

    const scan = deps.scansRepo.byId(scanId);
    if (!scan) throw new Error('scan vanished after completion');
    return { scan };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.scansRepo.complete({
      id: scanId,
      status: message === 'SCAN_CANCELED' ? 'canceled' : 'failed',
      summary: null,
      detection: emptyDetection(),
      warnings: [],
      fileCount: 0,
      byteCount: 0,
      completedAt: new Date().toISOString(),
      errorMessage: message
    });
    args.emitter?.send('failed', undefined, message);
    deps.logger.error({ scanId, projectId: project.id, err: message }, 'scan failed');
    throw err;
  }
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/main/scanner/index.ts src/main/projects/repo.ts src/main/projects/service.ts
git commit -m "feat(scanner): runScan orchestrator with progress events and persistence"
```

---

## Task 12: End-to-end scanner integration test

**Files:**
- Create: `E:\Projects\VibeOps\tests\main\scanner-end-to-end.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/scanner-end-to-end.test.ts`:

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

const logger = pino({ level: 'silent' });

let workdir: string;
let dbFile: string;
let projectDir: string;

function writeFiles(root: string, files: Array<[string, string]>) {
  for (const [rel, content] of files) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-scan-e2e-'));
  dbFile = path.join(workdir, 'db.sqlite');
  projectDir = path.join(workdir, 'next-supabase');
  fs.mkdirSync(projectDir, { recursive: true });
  writeFiles(projectDir, [
    ['package.json', JSON.stringify({
      name: 'demo',
      dependencies: { next: '14.0.0', react: '18.0.0', '@supabase/supabase-js': '^2' },
      devDependencies: { tailwindcss: '^3' }
    })],
    ['next.config.js', 'module.exports = {}'],
    ['app/page.tsx', 'export default function Page(){return null}'],
    ['app/api/health/route.ts', 'export const GET = () => new Response("ok")'],
    ['supabase/config.toml', '[project]\nname="demo"\n'],
    ['supabase/migrations/0001_init.sql', 'CREATE TABLE users(id uuid);'],
    ['vercel.json', '{"version":2}'],
    ['.env.example', '# Public URL\nNEXT_PUBLIC_API=https://api.example\n# Required\nDATABASE_URL=postgres://demo\n'],
    ['.env', 'SECRET=do-not-read'],
    ['README.md', '# Demo']
  ]);
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe('runScan end-to-end', () => {
  it('persists a completed scan with full detection', async () => {
    const handle = openDb(dbFile);
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });

    const { scan } = await runScan(
      { scansRepo, projectsService, logger },
      { projectId: project.id, emitter: null }
    );

    expect(scan.status).toBe('completed');
    expect(scan.detection.primaryStack).toBe('Next.js + React');
    expect(scan.detection.packageManager).toBe('npm');
    expect(scan.detection.database).toBe('Supabase Postgres');
    expect(scan.detection.auth).toBe('Supabase Auth');
    expect(scan.detection.deployment).toBe('Vercel');
    expect(scan.fileCount).toBeGreaterThan(0);
    expect(scan.summary).toContain('Next.js');

    const after = projectsService.byId(project.id)!;
    expect(after.lastScannedAt).not.toBeNull();
    expect(after.primaryStack).toBe('Next.js + React');

    const files = scansRepo.filesByScan(scan.id);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('app/page.tsx');
    expect(paths).not.toContain('.env');
    expect(files.find((f) => f.path === 'package.json')!.fileType).toBe('config');
    expect(files.find((f) => f.path === 'app/page.tsx')!.fileType).toBe('source');

    const env = scansRepo.envVarsByScan(scan.id);
    expect(env.find((v) => v.variable === 'NEXT_PUBLIC_API')?.required).toBe(false);
    expect(env.find((v) => v.variable === 'DATABASE_URL')?.required).toBe(true);

    expect(scan.warnings.some((w) => w.code === 'SECRET_FILE_PRESENT')).toBe(true);

    handle.close();
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm test -- tests/main/scanner-end-to-end.test.ts`
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add tests/main/scanner-end-to-end.test.ts
git commit -m "test(scanner): end-to-end scan against next.js+supabase fixture"
```

---

## Task 13: IPC handlers for scanning

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ipc\scanner-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Write `src/main/ipc/scanner-handlers.ts`**

```ts
import { BrowserWindow, ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import { runScan } from '@main/scanner';
import { ProgressEmitter } from '@main/scanner/progress';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectsService } from '@main/projects/service';

export interface ScannerContext {
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
}

export interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

const activeAborts = new Map<string, AbortController>();

export function registerScannerHandlers(ctx: ScannerContext): void {
  ipcMain.handle(IpcChannels.scanStart, async (_e, projectId: string): Promise<Result<Scan>> => {
    try {
      const controller = new AbortController();
      const emitter = new ProgressEmitter('', projectId, ctx.getMainWindow);
      const { scan } = await runScan(
        { scansRepo: ctx.scansRepo, projectsService: ctx.projectsService, logger: ctx.logger },
        { projectId, emitter, signal: controller.signal }
      );
      activeAborts.delete(scan.id);
      return ok(scan);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanCancel, (_e, scanId: string): Result<true> => {
    activeAborts.get(scanId)?.abort();
    return ok(true);
  });

  ipcMain.handle(IpcChannels.scanGet, (_e, scanId: string): Result<Scan | null> => {
    try { return ok(ctx.scansRepo.byId(scanId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanList, (_e, projectId: string): Result<Scan[]> => {
    try { return ok(ctx.scansRepo.listByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanLatest, (_e, projectId: string): Result<Scan | null> => {
    try { return ok(ctx.scansRepo.latestForProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanFiles, (_e, scanId: string): Result<ScanFile[]> => {
    try { return ok(ctx.scansRepo.filesByScan(scanId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.scanEnvVars, (_e, scanId: string): Result<ScanEnvVar[]> => {
    try { return ok(ctx.scansRepo.envVarsByScan(scanId)); } catch (e) { return fail(e); }
  });
}
```

> **Note:** Cancellation is best-effort — fast-glob doesn't accept AbortSignal natively. The `walkProject` implementation only checks `signal.aborted` between entries. Phase 5 may improve this with a streaming walker if needed.

- [ ] **Step 2: Re-export from `src/main/ipc/handlers.ts`**

Append:

```ts
export { registerScannerHandlers } from './scanner-handlers';
```

- [ ] **Step 3: Replace `src/main/index.ts`**

```ts
import { app, BrowserWindow, session } from 'electron';
import { createMainWindow } from './window';
import { registerCoreHandlers, registerProjectsHandlers, registerScannerHandlers } from './ipc/handlers';
import { resolveAppPaths } from './db/paths';
import { openDb } from './db/client';
import { runMigrations } from './db/migrate';
import { getLogger } from './logger';
import { ProjectsRepo } from './projects/repo';
import { ProjectsService } from './projects/service';
import { ScansRepo } from './scanner/repo';

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const paths = resolveAppPaths();
  const log = getLogger(paths.logsDir);
  log.info({ root: paths.root }, 'app data root resolved');

  const handle = openDb(paths.dbFile);
  runMigrations(handle);
  log.info('database migrated');

  const projectsRepo = new ProjectsRepo(handle.db);
  const projectsService = new ProjectsService(projectsRepo);
  const scansRepo = new ScansRepo(handle.db);

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:5173 http://localhost:5173"
        ]
      }
    });
  });

  registerCoreHandlers();
  registerProjectsHandlers({ service: projectsService, getMainWindow: () => mainWindow });
  registerScannerHandlers({
    scansRepo,
    projectsService,
    logger: log,
    getMainWindow: () => mainWindow
  });

  mainWindow = createMainWindow();

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      handle.close();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  app.exit(1);
});
```

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/scanner-handlers.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(ipc): scanner handlers wired into bootstrap"
```

---

## Task 14: Preload exposes scanner namespace + onProgress

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Replace `src/preload/api.ts`**

```ts
import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  AppInfo, FolderPickResult, Project, ProjectInput, ProjectListQuery, ProjectPatch,
  Scan, ScanFile, ScanEnvVar
} from '@shared/types';
import type { ScanProgressEvent } from '@shared/scan-events';

export interface IpcError { code: string; message: string; meta?: Record<string, unknown>; }
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

function unwrap<T>(p: Promise<IpcResult<T>>): Promise<T> {
  return p.then((r) => {
    if (r.ok) return r.value;
    const err = new Error(r.error.message) as Error & { code?: string; meta?: unknown };
    err.code = r.error.code;
    err.meta = r.error.meta;
    throw err;
  });
}

export const api = {
  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.ping),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appVersion),
  projects: {
    pickFolder: (): Promise<FolderPickResult> => ipcRenderer.invoke(IpcChannels.projectsPickFolder),
    list: (q: ProjectListQuery = {}): Promise<Project[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsList, q)),
    get: (id: string): Promise<Project | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsGet, id)),
    add: (input: ProjectInput, allowDuplicate = false): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsAdd, { input, allowDuplicate })),
    update: (patch: ProjectPatch): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsUpdate, patch)),
    archive: (id: string): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsArchive, id)),
    unarchive: (id: string): Promise<Project> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsUnarchive, id)),
    remove: (id: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsRemove, id)),
    checkPath: (p: string): Promise<Project | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.projectsCheckPath, p))
  },
  scans: {
    start: (projectId: string): Promise<Scan> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanStart, projectId)),
    cancel: (scanId: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanCancel, scanId)),
    get: (scanId: string): Promise<Scan | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanGet, scanId)),
    list: (projectId: string): Promise<Scan[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanList, projectId)),
    latest: (projectId: string): Promise<Scan | null> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanLatest, projectId)),
    files: (scanId: string): Promise<ScanFile[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanFiles, scanId)),
    envVars: (scanId: string): Promise<ScanEnvVar[]> =>
      unwrap(ipcRenderer.invoke(IpcChannels.scanEnvVars, scanId)),
    onProgress: (cb: (e: ScanProgressEvent) => void): (() => void) => {
      const handler = (_e: unknown, evt: ScanProgressEvent) => cb(evt);
      ipcRenderer.on(IpcChannels.scanProgress, handler);
      return () => ipcRenderer.removeListener(IpcChannels.scanProgress, handler);
    }
  }
};

export type VibeOpsApi = typeof api;
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/api.ts
git commit -m "feat(preload): scans namespace with onProgress subscription"
```

---

## Task 15: Renderer scan hooks + progress bar

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\useScans.ts`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\ScanProgressBar.tsx`

- [ ] **Step 1: Write `useScans.ts`**

```ts
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import type { ScanProgressEvent } from '@shared/scan-events';

const scansKey = (projectId: string) => ['scans', projectId] as const;
const latestKey = (projectId: string) => ['scans', projectId, 'latest'] as const;
const filesKey = (scanId: string) => ['scan-files', scanId] as const;
const envVarsKey = (scanId: string) => ['scan-envs', scanId] as const;

export function useScanList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? scansKey(projectId) : ['scans', '__none__'],
    queryFn: () => (projectId ? api.scans.list(projectId) : Promise.resolve<Scan[]>([])),
    enabled: !!projectId
  });
}

export function useLatestScan(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['scans', '__none__', 'latest'],
    queryFn: () => (projectId ? api.scans.latest(projectId) : Promise.resolve<Scan | null>(null)),
    enabled: !!projectId
  });
}

export function useScanFiles(scanId: string | undefined) {
  return useQuery({
    queryKey: scanId ? filesKey(scanId) : ['scan-files', '__none__'],
    queryFn: () => (scanId ? api.scans.files(scanId) : Promise.resolve<ScanFile[]>([])),
    enabled: !!scanId
  });
}

export function useScanEnvVars(scanId: string | undefined) {
  return useQuery({
    queryKey: scanId ? envVarsKey(scanId) : ['scan-envs', '__none__'],
    queryFn: () => (scanId ? api.scans.envVars(scanId) : Promise.resolve<ScanEnvVar[]>([])),
    enabled: !!scanId
  });
}

export function useStartScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.scans.start(projectId),
    onSuccess: (_scan, projectId) => {
      qc.invalidateQueries({ queryKey: scansKey(projectId) });
      qc.invalidateQueries({ queryKey: latestKey(projectId) });
      qc.invalidateQueries({ queryKey: ['projects', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}

export function useScanProgress(projectId: string | undefined): ScanProgressEvent | null {
  const [evt, setEvt] = useState<ScanProgressEvent | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const off = api.scans.onProgress((e) => {
      if (e.projectId === projectId) setEvt(e);
    });
    return off;
  }, [projectId]);
  return evt;
}
```

- [ ] **Step 2: Write `ScanProgressBar.tsx`**

```tsx
import type { ScanProgressEvent } from '@shared/scan-events';

const STAGE_LABEL: Record<ScanProgressEvent['stage'], string> = {
  walking: 'Walking project tree',
  classifying: 'Classifying files',
  detecting: 'Detecting stack',
  persisting: 'Saving file inventory',
  summarizing: 'Generating summary',
  completed: 'Completed',
  failed: 'Failed'
};

const STAGE_PCT: Record<ScanProgressEvent['stage'], number> = {
  walking: 20, classifying: 45, detecting: 65, persisting: 80, summarizing: 92, completed: 100, failed: 100
};

export function ScanProgressBar({ event }: { event: ScanProgressEvent | null }) {
  if (!event) return null;
  const pct = STAGE_PCT[event.stage];
  const failed = event.stage === 'failed';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{STAGE_LABEL[event.stage]} · {event.filesSeen} files seen</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={failed ? 'h-full bg-destructive' : 'h-full bg-primary'}
          style={{ width: `${pct}%`, transition: 'width 250ms ease-out' }}
        />
      </div>
      {event.errorMessage && <div className="text-xs text-destructive">{event.errorMessage}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/projects/useScans.ts src/renderer/features/projects/ScanProgressBar.tsx
git commit -m "feat(renderer): scan hooks and progress bar"
```

---

## Task 16: Project detail tabs + Scan tab UI

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\tabs.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectScanTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectOverviewTab.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectDetailRoute.tsx`

- [ ] **Step 1: Add radix tabs dep + primitive**

Run: `pnpm add @radix-ui/react-tabs`

Write `src/renderer/components/ui/tabs.tsx`:

```tsx
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn('inline-flex h-9 items-center justify-start gap-1 rounded-md border border-border bg-card p-1', className)}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1 text-sm font-medium transition-all data-[state=active]:bg-secondary data-[state=active]:text-foreground text-muted-foreground hover:text-foreground',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
```

- [ ] **Step 2: Replace `ProjectOverviewTab.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStatusBadge } from '@/features/projects/ProjectStatusBadge';
import { useLatestScan } from '@/features/projects/useScans';
import type { Project } from '@shared/types';

function row(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-border py-2 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">{value}</div>
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  const { data: latest } = useLatestScan(project.id);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.description ?? 'No description yet.'}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {row('Status', <ProjectStatusBadge status={project.status} />)}
          {row('Local Path', <code className="text-xs break-all">{project.localPath}</code>)}
          {row('Repository', project.repoUrl ?? '—')}
          {row('Category', project.category ?? '—')}
          {row('Tags', project.tags.length === 0 ? '—' : project.tags.join(', '))}
          {row('Last Scan', project.lastScannedAt ?? 'Never')}
          {row('Last Audit', project.lastAuditedAt ?? 'Never (Phase 5)')}
          {row('Created', new Date(project.createdAt).toLocaleString())}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detected Stack</CardTitle>
          <CardDescription>{latest?.summary ?? 'Run a scan to populate.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <div className="text-sm text-muted-foreground">No scan yet. Open the Scan tab to run one.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {row('Primary Stack', latest.detection.primaryStack ?? '—')}
              {row('Frameworks', latest.detection.frameworks.join(', ') || '—')}
              {row('Package Manager', latest.detection.packageManager ?? '—')}
              {row('Database', latest.detection.database ?? '—')}
              {row('Auth', latest.detection.auth ?? '—')}
              {row('Deployment', latest.detection.deployment ?? '—')}
              {row('Files indexed', String(latest.fileCount))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Write `ProjectScanTab.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScanProgressBar } from '@/features/projects/ScanProgressBar';
import {
  useScanList, useLatestScan, useScanFiles, useScanEnvVars, useStartScan, useScanProgress
} from '@/features/projects/useScans';
import type { Project, ScanFile, FileType } from '@shared/types';

const TYPE_BADGE: Record<FileType, 'default' | 'secondary' | 'warning' | 'destructive' | 'outline' | 'success'> = {
  source: 'default',
  config: 'secondary',
  doc: 'outline',
  lock: 'outline',
  'env-example': 'warning',
  'env-secret': 'destructive',
  binary: 'outline',
  asset: 'outline',
  test: 'success',
  unknown: 'outline'
};

export function ProjectScanTab({ project }: { project: Project }) {
  const start = useStartScan();
  const progress = useScanProgress(project.id);
  const { data: history = [] } = useScanList(project.id);
  const { data: latest } = useLatestScan(project.id);
  const [filter, setFilter] = useState('');

  const targetScanId = latest?.id;
  const { data: files = [] } = useScanFiles(targetScanId);
  const { data: envVars = [] } = useScanEnvVars(targetScanId);

  const filtered = useMemo<ScanFile[]>(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return files.slice(0, 200);
    return files.filter((file) => file.path.toLowerCase().includes(f)).slice(0, 200);
  }, [files, filter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Project Scan</CardTitle>
            <CardDescription>Read-only walk of the project tree. No files are modified.</CardDescription>
          </div>
          <Button onClick={() => start.mutate(project.id)} disabled={start.isPending}>
            <Play className="h-4 w-4" /> {start.isPending ? 'Scanning…' : 'Run Scan'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanProgressBar event={progress} />
          {start.isError && (
            <div className="text-sm text-destructive">{(start.error as Error).message}</div>
          )}
          {history.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">History</div>
              <div className="space-y-1 text-sm">
                {history.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div>
                      <div className="font-medium">{s.completedAt ? new Date(s.completedAt).toLocaleString() : 'in progress'}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.fileCount} files · {s.detection.primaryStack ?? '—'}
                      </div>
                    </div>
                    <Badge variant={s.status === 'completed' ? 'success' : s.status === 'failed' ? 'destructive' : 'secondary'}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {latest && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Variables (names only)</CardTitle>
              <CardDescription>Extracted from .env.example. Values are never read or stored.</CardDescription>
            </CardHeader>
            <CardContent>
              {envVars.length === 0 ? (
                <div className="text-sm text-muted-foreground">No .env.example found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1">Variable</th><th>File</th><th>Required</th><th>Comment</th></tr>
                  </thead>
                  <tbody>
                    {envVars.map((v) => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="py-1 font-mono text-xs">{v.variable}</td>
                        <td className="text-xs text-muted-foreground">{v.filename}</td>
                        <td>{v.required ? <Badge variant="warning">required</Badge> : <Badge variant="outline">optional</Badge>}</td>
                        <td className="text-xs text-muted-foreground">{v.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">File Inventory</CardTitle>
              <CardDescription>Top files by importance. Showing up to 200.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Filter by path"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-3 max-w-sm"
              />
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-1">Path</th><th>Type</th><th>Size</th><th>Importance</th></tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-1 font-mono text-xs break-all">{f.path}</td>
                      <td><Badge variant={TYPE_BADGE[f.fileType]}>{f.fileType}</Badge></td>
                      <td className="text-xs text-muted-foreground">{(f.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="text-xs text-muted-foreground">{f.importanceScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">No matches.</div>}
            </CardContent>
          </Card>

          {latest.warnings.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Warnings</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {latest.warnings.map((w, i) => (
                  <div key={i} className="rounded-md border border-amber-600/40 bg-amber-600/5 px-3 py-2">
                    <div className="text-xs text-amber-600">{w.code}</div>
                    <div>{w.message}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Replace `ProjectDetailRoute.tsx` with tabs**

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Archive, Trash2, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useProject, useArchiveProject, useUnarchiveProject, useRemoveProject } from '@/features/projects/useProjects';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectScanTab } from './ProjectScanTab';

export function ProjectDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id);
  const archive = useArchiveProject();
  const unarchive = useUnarchiveProject();
  const remove = useRemoveProject();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="text-sm text-muted-foreground">Project not found.</div>;

  async function onRemove() {
    if (!project) return;
    const yes = window.confirm(
      `Remove "${project.name}" from VibeOps? Local files at ${project.localPath} will not be deleted.`
    );
    if (!yes) return;
    await remove.mutateAsync(project.id);
    navigate('/projects');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {project.status === 'archived' ? (
            <Button variant="outline" size="sm" onClick={() => unarchive.mutate(project.id)}>
              <RotateCcw className="h-4 w-4" /> Unarchive
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => archive.mutate(project.id)}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="memory" disabled>Memory (Phase 3)</TabsTrigger>
          <TabsTrigger value="audits" disabled>Audits (Phase 5)</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ProjectOverviewTab project={project} /></TabsContent>
        <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
      </Tabs>

      <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/routes/projects src/renderer/components/ui/tabs.tsx package.json pnpm-lock.yaml
git commit -m "feat(projects): tabbed detail view with Scan tab and stack summary"
```

---

## Task 17: Phase 2 acceptance check

- [ ] **Step 1: Run quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Manual flow against PRD §11.7**

Run: `pnpm dev`. Pick a registered project (Phase 1 added).

Verify:
- Open project detail → Scan tab → "Run Scan".
- Progress bar steps through Walking → Classifying → Detecting → Persisting → Summarizing → Completed.
- Stack panel populated with primary stack, frameworks, package manager, db, auth, deployment.
- File inventory lists `package.json`, source files, configs. NO `.env`. `.env.example` present and tagged `env-example`.
- Env vars table lists names only.
- Warnings card lists `SECRET_FILE_PRESENT` if `.env` exists in project.
- Run scan again — second scan row appears in History.
- Open SQLite DB at `%APPDATA%\VibeOps\vibeops.db` (e.g. `sqlite3` CLI): `SELECT COUNT(*) FROM project_files;` > 0; `SELECT * FROM project_env_vars LIMIT 5;` shows variable names only, no value column.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a phase-2 -m "Phase 2 complete: scanner"
```

---

## Self-Review Notes

- **Spec coverage (PRD §11.7):** scan completes ✓, ignores generated folders ✓ (via `DEFAULT_IGNORES` + `.gitignore`), no raw `.env` storage ✓, package manager ✓, frameworks ✓, results saved ✓.
- **Spec coverage (PRD §24.1 algorithm):** project record from Phase 1 (steps 1-4), `walkProject` (5-7), `hashFile` for files ≤1 MB (8), `safeReadText` (9), `detectAll` (10-12), `extractEnvVarNames` from `.env.example` only (13), `insertFiles` + `insertEnvVars` (14), `buildSummary` (15), `markScanned` + `setPrimaryStack` (16).
- **Type consistency:** `ScanFile.fileType` is `FileType` enum used both in `classifyFile` and DB column. `Scan.detection.primaryStack` aligns with `projects.primary_stack`. `IpcChannels.scanProgress` matches preload listener and `ProgressEmitter.send`.
- **Risks:**
  - Files >50 MB get metadata-only; 1 MB cap on hashing. Both deliberate.
  - Single-process scanning blocks the main thread on huge projects. Acceptable for MVP (PRD §34.2 — under 2 min on medium project).
  - Cancellation is best-effort.
- **Security posture:** Renderer never reads files. All FS access stays in main. `.env` filenames are flagged but contents are never read.
