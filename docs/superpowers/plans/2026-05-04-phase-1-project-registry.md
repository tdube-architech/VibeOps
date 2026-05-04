# VibeOps Phase 1: Project Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let user add, view, edit, archive, and remove local project folders. All folder picking goes through main process IPC. Projects persist in SQLite. Dashboard renders the project table.

**Architecture:** Renderer never touches the filesystem. `dialog.showOpenDialog` runs in main process via IPC. A `projectsRepo` module wraps Drizzle queries; IPC handlers call it. Renderer uses TanStack Query for cache, TanStack Table for list, Zustand for transient UI state (selected row, modal open). Slug generation deterministic from name. Duplicate path detection at the repo layer.

**Tech Stack:** Electron `dialog`, Drizzle ORM (existing schema from Phase 0), TanStack Query/Table, react-router, shadcn primitives, `nanoid` for ids.

**Reference docs:** PRD §10 (Project Registry), §17 (Dashboard), §22.1 (projects table), §29.1.

**Prerequisites:** Phase 0 plan complete. `phase-0` git tag exists.

---

## File Structure

```
src/
├── main/
│   ├── ipc/
│   │   ├── handlers.ts                       # MODIFY — register projects channels
│   │   └── projects-handlers.ts              # NEW — folder picker + CRUD handlers
│   ├── projects/
│   │   ├── repo.ts                           # NEW — Drizzle queries
│   │   ├── service.ts                        # NEW — business rules (slug, dup check)
│   │   └── ids.ts                            # NEW — nanoid wrapper
│   └── index.ts                              # MODIFY — wire new handlers
├── shared/
│   ├── ipc-channels.ts                       # MODIFY — add project channels
│   ├── types.ts                              # MODIFY — add ProjectInput, ProjectPatch
│   └── slug.ts                               # NEW — pure slug fn (shared)
├── preload/
│   └── api.ts                                # MODIFY — projects namespace
└── renderer/
    ├── routes/
    │   ├── DashboardRoute.tsx                # MODIFY — render project table
    │   └── ProjectsRoute.tsx                 # MODIFY — full project list + detail link
    ├── routes/projects/
    │   ├── ProjectDetailRoute.tsx            # NEW — /projects/:id
    │   └── ProjectOverviewTab.tsx            # NEW — overview of one project
    ├── features/projects/
    │   ├── useProjects.ts                    # NEW — query hooks
    │   ├── ProjectTable.tsx                  # NEW — TanStack Table
    │   ├── AddProjectButton.tsx              # NEW — button + dialog
    │   ├── EditProjectDialog.tsx             # NEW — edit metadata
    │   ├── DuplicatePathDialog.tsx           # NEW — confirm dup add
    │   └── ProjectStatusBadge.tsx            # NEW — color-coded
    └── components/ui/                        # NEW shadcn primitives
        ├── dialog.tsx
        ├── input.tsx
        ├── label.tsx
        ├── textarea.tsx
        └── select.tsx

tests/
├── shared/
│   └── slug.test.ts                          # NEW
└── main/
    └── projects-repo.test.ts                 # NEW
```

---

## Task 1: Slug helper + tests

**Files:**
- Create: `E:\Projects\VibeOps\src\shared\slug.ts`
- Create: `E:\Projects\VibeOps\tests\shared\slug.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/shared/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { slugify, ensureUniqueSlug } from '@shared/slug';

describe('slugify', () => {
  it('lowercases and replaces spaces with dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips diacritics', () => {
    expect(slugify('Café Pâté')).toBe('cafe-pate');
  });
  it('collapses repeated separators', () => {
    expect(slugify('a   b---c')).toBe('a-b-c');
  });
  it('strips leading/trailing dashes', () => {
    expect(slugify('--Hi--')).toBe('hi');
  });
  it('truncates very long names', () => {
    expect(slugify('x'.repeat(120)).length).toBeLessThanOrEqual(64);
  });
  it('returns "project" for empty/punctuation-only input', () => {
    expect(slugify('!!!')).toBe('project');
    expect(slugify('')).toBe('project');
  });
});

describe('ensureUniqueSlug', () => {
  it('returns base slug if not taken', () => {
    expect(ensureUniqueSlug('foo', new Set())).toBe('foo');
  });
  it('appends -2, -3 when taken', () => {
    expect(ensureUniqueSlug('foo', new Set(['foo']))).toBe('foo-2');
    expect(ensureUniqueSlug('foo', new Set(['foo', 'foo-2']))).toBe('foo-3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/shared/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/slug.ts`**

```ts
const MAX_LEN = 64;

export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LEN);
  return normalized.length > 0 ? normalized : 'project';
}

export function ensureUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`.slice(0, MAX_LEN);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`could not generate unique slug for ${base}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/shared/slug.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/slug.ts tests/shared/slug.test.ts
git commit -m "feat(shared): pure slugify + uniqueness helper"
```

---

## Task 2: Shared types extension

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`

- [ ] **Step 1: Append types to `src/shared/types.ts`**

Add after the existing `Project` interface:

```ts
export interface ProjectInput {
  name: string;
  localPath: string;
  description?: string;
  category?: string;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string;
}

export interface ProjectPatch {
  id: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string | null;
}

export interface FolderPickResult {
  canceled: boolean;
  path: string | null;
}

export type ProjectListSort = 'recent' | 'name' | 'lastScanned';

export interface ProjectListQuery {
  search?: string;
  status?: ProjectStatus | 'all';
  sort?: ProjectListSort;
  includeArchived?: boolean;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add ProjectInput, ProjectPatch, FolderPickResult"
```

---

## Task 3: ID generator

**Files:**
- Create: `E:\Projects\VibeOps\src\main\projects\ids.ts`

- [ ] **Step 1: Add nanoid**

Run: `pnpm add nanoid`
Expected: success.

- [ ] **Step 2: Write `src/main/projects/ids.ts`**

```ts
import { customAlphabet } from 'nanoid';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const generate = customAlphabet(ALPHABET, 16);

export function newProjectId(): string {
  return `prj_${generate()}`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/projects/ids.ts package.json pnpm-lock.yaml
git commit -m "feat(main): nanoid-backed project id generator"
```

---

## Task 4: Projects repository

**Files:**
- Create: `E:\Projects\VibeOps\src\main\projects\repo.ts`
- Create: `E:\Projects\VibeOps\tests\main\projects-repo.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/projects-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openDb, type DbHandle } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';

let tmp: string;
let dbFile: string;
let handle: DbHandle;
let repo: ProjectsRepo;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-repo-'));
  dbFile = path.join(tmp, 'r.db');
  handle = openDb(dbFile);
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  repo = new ProjectsRepo(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ProjectsRepo', () => {
  it('inserts and retrieves a project', () => {
    const created = repo.insert({
      id: 'p1', name: 'Alpha', slug: 'alpha', localPath: 'C:/projects/alpha'
    });
    expect(created.id).toBe('p1');
    const fetched = repo.byId('p1');
    expect(fetched?.name).toBe('Alpha');
    expect(fetched?.tags).toEqual([]);
  });

  it('lists projects ordered by createdAt desc by default', () => {
    repo.insert({ id: 'a', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: 'b', name: 'B', slug: 'b', localPath: 'C:/b' });
    const list = repo.list({});
    expect(list.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('filters by search across name + path', () => {
    repo.insert({ id: '1', name: 'My App', slug: 'my-app', localPath: 'C:/apps/my-app' });
    repo.insert({ id: '2', name: 'Other', slug: 'other', localPath: 'C:/x/other' });
    expect(repo.list({ search: 'my' }).map((p) => p.id)).toEqual(['1']);
    expect(repo.list({ search: 'apps' }).map((p) => p.id)).toEqual(['1']);
  });

  it('excludes archived by default but includes when asked', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: '2', name: 'Z', slug: 'z', localPath: 'C:/z', status: 'archived' });
    expect(repo.list({}).map((p) => p.id)).toEqual(['1']);
    expect(repo.list({ includeArchived: true }).map((p) => p.id).sort()).toEqual(['1', '2']);
  });

  it('byPath finds by exact local_path', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/Apps/A' });
    expect(repo.byPath('C:/Apps/A')?.id).toBe('1');
    expect(repo.byPath('C:/apps/a')).toBeNull();
  });

  it('takenSlugs returns set of slugs', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: '2', name: 'B', slug: 'b', localPath: 'C:/b' });
    const slugs = repo.takenSlugs();
    expect(slugs.has('a')).toBe(true);
    expect(slugs.has('b')).toBe(true);
    expect(slugs.size).toBe(2);
  });

  it('update modifies fields and bumps updated_at', async () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    const before = repo.byId('1')!;
    await new Promise((r) => setTimeout(r, 1100));
    repo.update({ id: '1', name: 'A2', tags: ['x', 'y'] });
    const after = repo.byId('1')!;
    expect(after.name).toBe('A2');
    expect(after.tags).toEqual(['x', 'y']);
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });

  it('archive sets status without deleting row', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.archive('1');
    expect(repo.byId('1')?.status).toBe('archived');
  });

  it('remove deletes the row', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.remove('1');
    expect(repo.byId('1')).toBeNull();
  });

  it('insert throws on duplicate localPath', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/dup' });
    expect(() =>
      repo.insert({ id: '2', name: 'B', slug: 'b', localPath: 'C:/dup' })
    ).toThrow(/UNIQUE/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/projects-repo.test.ts`
Expected: FAIL — `ProjectsRepo` module missing.

- [ ] **Step 3: Write `src/main/projects/repo.ts`**

```ts
import { and, desc, eq, like, ne, or, asc } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projects, type ProjectRow } from '@main/db/schema';
import type {
  Project,
  ProjectPatch,
  ProjectListQuery,
  ProjectStatus
} from '@shared/types';

interface InsertParams {
  id: string;
  name: string;
  slug: string;
  localPath: string;
  description?: string | null;
  category?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string | null;
  primaryStack?: string | null;
}

function rowToProject(row: ProjectRow): Project {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags ?? '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    localPath: row.localPath,
    repoUrl: row.repoUrl,
    category: row.category,
    status: (row.status as ProjectStatus) ?? 'active',
    primaryStack: row.primaryStack,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastScannedAt: row.lastScannedAt,
    lastAuditedAt: row.lastAuditedAt
  };
}

export class ProjectsRepo {
  constructor(private readonly db: Db) {}

  insert(params: InsertParams): Project {
    const now = new Date().toISOString();
    this.db.insert(projects).values({
      id: params.id,
      name: params.name,
      slug: params.slug,
      description: params.description ?? null,
      localPath: params.localPath,
      repoUrl: params.repoUrl ?? null,
      category: params.category ?? null,
      status: params.status ?? 'active',
      primaryStack: params.primaryStack ?? null,
      tags: JSON.stringify(params.tags ?? []),
      createdAt: now,
      updatedAt: now,
      lastScannedAt: null,
      lastAuditedAt: null
    }).run();
    const row = this.byId(params.id);
    if (!row) throw new Error('insert succeeded but row missing');
    return row;
  }

  byId(id: string): Project | null {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
    return row ? rowToProject(row) : null;
  }

  byPath(localPath: string): Project | null {
    const row = this.db.select().from(projects).where(eq(projects.localPath, localPath)).get();
    return row ? rowToProject(row) : null;
  }

  takenSlugs(): Set<string> {
    const rows = this.db.select({ slug: projects.slug }).from(projects).all();
    return new Set(rows.map((r) => r.slug));
  }

  list(q: ProjectListQuery): Project[] {
    const conditions = [];
    if (!q.includeArchived) conditions.push(ne(projects.status, 'archived'));
    if (q.status && q.status !== 'all') conditions.push(eq(projects.status, q.status));
    if (q.search && q.search.trim().length > 0) {
      const pat = `%${q.search.trim().toLowerCase()}%`;
      conditions.push(or(like(projects.name, pat), like(projects.localPath, pat))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderBy =
      q.sort === 'name' ? asc(projects.name)
      : q.sort === 'lastScanned' ? desc(projects.lastScannedAt)
      : desc(projects.createdAt);

    const rows = where
      ? this.db.select().from(projects).where(where).orderBy(orderBy).all()
      : this.db.select().from(projects).orderBy(orderBy).all();

    return rows.map(rowToProject);
  }

  update(patch: ProjectPatch): Project {
    const set: Partial<ProjectRow> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
    if (patch.repoUrl !== undefined) set.repoUrl = patch.repoUrl;
    this.db.update(projects).set(set).where(eq(projects.id, patch.id)).run();
    const row = this.byId(patch.id);
    if (!row) throw new Error(`project ${patch.id} not found after update`);
    return row;
  }

  archive(id: string): Project {
    return this.update({ id, status: 'archived' });
  }

  unarchive(id: string): Project {
    return this.update({ id, status: 'active' });
  }

  remove(id: string): void {
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/main/projects-repo.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/projects/repo.ts tests/main/projects-repo.test.ts
git commit -m "feat(main): ProjectsRepo with CRUD, list filters, archive"
```

---

## Task 5: Projects service (orchestration + folder validation)

**Files:**
- Create: `E:\Projects\VibeOps\src\main\projects\service.ts`

- [ ] **Step 1: Write `src/main/projects/service.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch } from '@shared/types';
import { slugify, ensureUniqueSlug } from '@shared/slug';
import { newProjectId } from './ids';
import type { ProjectsRepo } from './repo';

export class DuplicatePathError extends Error {
  readonly code = 'DUPLICATE_PATH';
  constructor(public readonly existing: Project) {
    super(`Path already registered as project ${existing.id}`);
  }
}

export class InvalidPathError extends Error {
  readonly code = 'INVALID_PATH';
  constructor(message: string) { super(message); }
}

export interface AddProjectOptions {
  allowDuplicate?: boolean;
}

export class ProjectsService {
  constructor(private readonly repo: ProjectsRepo) {}

  list(q: ProjectListQuery): Project[] {
    return this.repo.list(q);
  }

  byId(id: string): Project | null {
    return this.repo.byId(id);
  }

  add(input: ProjectInput, opts: AddProjectOptions = {}): Project {
    const normalizedPath = path.resolve(input.localPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(normalizedPath);
    } catch {
      throw new InvalidPathError(`Path does not exist: ${normalizedPath}`);
    }
    if (!stat.isDirectory()) {
      throw new InvalidPathError(`Not a directory: ${normalizedPath}`);
    }

    if (!opts.allowDuplicate) {
      const existing = this.repo.byPath(normalizedPath);
      if (existing) throw new DuplicatePathError(existing);
    }

    const baseSlug = slugify(input.name);
    const slug = ensureUniqueSlug(baseSlug, this.repo.takenSlugs());

    return this.repo.insert({
      id: newProjectId(),
      name: input.name.trim(),
      slug,
      localPath: normalizedPath,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      status: input.status ?? 'active',
      tags: input.tags ?? [],
      repoUrl: input.repoUrl?.trim() || null
    });
  }

  update(patch: ProjectPatch): Project {
    return this.repo.update(patch);
  }

  archive(id: string): Project {
    return this.repo.archive(id);
  }

  unarchive(id: string): Project {
    return this.repo.unarchive(id);
  }

  remove(id: string): void {
    this.repo.remove(id);
  }

  pathExists(localPath: string): Project | null {
    return this.repo.byPath(path.resolve(localPath));
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/main/projects/service.ts
git commit -m "feat(main): ProjectsService with path validation and slug uniqueness"
```

---

## Task 6: Add IPC channels and handlers

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\projects-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Update `src/shared/ipc-channels.ts`**

Replace contents:

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
  projectsCheckPath: 'projects:checkPath'
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export const IPC_CHANNEL_LIST: readonly IpcChannel[] = Object.values(IpcChannels);
```

- [ ] **Step 2: Verify ipc-channels test still passes**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass (uniqueness + list-matches assertions still hold with new channels).

- [ ] **Step 3: Write `src/main/ipc/projects-handlers.ts`**

```ts
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  FolderPickResult,
  Project,
  ProjectInput,
  ProjectListQuery,
  ProjectPatch
} from '@shared/types';
import { ProjectsService, DuplicatePathError, InvalidPathError } from '@main/projects/service';

export interface ProjectsContext {
  service: ProjectsService;
  getMainWindow: () => BrowserWindow | null;
}

export interface IpcError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}

function toIpcError(err: unknown): IpcError {
  if (err instanceof DuplicatePathError) {
    return { code: err.code, message: err.message, meta: { existing: err.existing } };
  }
  if (err instanceof InvalidPathError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: 'INTERNAL', message: err.message };
  }
  return { code: 'INTERNAL', message: String(err) };
}

type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (err: unknown): Result<never> => ({ ok: false, error: toIpcError(err) });

export function registerProjectsHandlers(ctx: ProjectsContext): void {
  ipcMain.handle(IpcChannels.projectsPickFolder, async (): Promise<FolderPickResult> => {
    const win = ctx.getMainWindow();
    const opts = { properties: ['openDirectory' as const, 'createDirectory' as const] };
    const result = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null };
    }
    return { canceled: false, path: result.filePaths[0] ?? null };
  });

  ipcMain.handle(IpcChannels.projectsList, (_e, q: ProjectListQuery): Result<Project[]> => {
    try { return ok(ctx.service.list(q ?? {})); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsGet, (_e, id: string): Result<Project | null> => {
    try { return ok(ctx.service.byId(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(
    IpcChannels.projectsAdd,
    (_e, payload: { input: ProjectInput; allowDuplicate?: boolean }): Result<Project> => {
      try { return ok(ctx.service.add(payload.input, { allowDuplicate: payload.allowDuplicate })); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.projectsUpdate, (_e, patch: ProjectPatch): Result<Project> => {
    try { return ok(ctx.service.update(patch)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsArchive, (_e, id: string): Result<Project> => {
    try { return ok(ctx.service.archive(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsUnarchive, (_e, id: string): Result<Project> => {
    try { return ok(ctx.service.unarchive(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsRemove, (_e, id: string): Result<true> => {
    try { ctx.service.remove(id); return ok(true); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.projectsCheckPath, (_e, p: string): Result<Project | null> => {
    try { return ok(ctx.service.pathExists(p)); } catch (e) { return fail(e); }
  });
}
```

- [ ] **Step 4: Update `src/main/ipc/handlers.ts`**

Replace contents:

```ts
import { app, ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppInfo } from '@shared/types';

export function registerCoreHandlers(): void {
  ipcMain.handle(IpcChannels.ping, () => 'pong');
  ipcMain.handle(IpcChannels.appVersion, (): AppInfo => ({
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    platform: process.platform
  }));
}

export { registerProjectsHandlers } from './projects-handlers';
```

- [ ] **Step 5: Wire handlers in `src/main/index.ts`**

Open `src/main/index.ts`. Replace its contents:

```ts
import { app, BrowserWindow, session } from 'electron';
import { createMainWindow } from './window';
import { registerCoreHandlers, registerProjectsHandlers } from './ipc/handlers';
import { resolveAppPaths } from './db/paths';
import { openDb } from './db/client';
import { runMigrations } from './db/migrate';
import { getLogger } from './logger';
import { ProjectsRepo } from './projects/repo';
import { ProjectsService } from './projects/service';

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
  registerProjectsHandlers({
    service: projectsService,
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

- [ ] **Step 6: Run tests**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc src/main/index.ts
git commit -m "feat(ipc): projects channels with typed Result-shape responses"
```

---

## Task 7: Preload API surface

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Replace `src/preload/api.ts`**

```ts
import { ipcRenderer } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type {
  AppInfo,
  FolderPickResult,
  Project,
  ProjectInput,
  ProjectListQuery,
  ProjectPatch
} from '@shared/types';

export interface IpcError {
  code: string;
  message: string;
  meta?: Record<string, unknown>;
}
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
git commit -m "feat(preload): typed projects namespace with error unwrapping"
```

---

## Task 8: shadcn primitives needed for Phase 1 UI

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\dialog.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\input.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\label.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\textarea.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\components\ui\select.tsx`

- [ ] **Step 1: Add radix deps**

Run: `pnpm add @radix-ui/react-dialog @radix-ui/react-label @radix-ui/react-select`
Expected: success.

- [ ] **Step 2: Write `dialog.tsx`**

```tsx
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-black/60 backdrop-blur-sm', className)}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-xl',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background hover:opacity-100">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col space-y-1.5 text-left', className)} {...props} />;
}
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-row justify-end space-x-2', className)} {...props} />;
}
export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';
export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
```

- [ ] **Step 3: Write `input.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
```

- [ ] **Step 4: Write `label.tsx`**

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-sm font-medium leading-none', className)} {...props} />
));
Label.displayName = 'Label';
```

- [ ] **Step 5: Write `textarea.tsx`**

```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 6: Write `select.tsx`**

```tsx
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md',
        className
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';
```

- [ ] **Step 7: Add popover/popper-side CSS variable defaults to `index.css`**

Open `src/renderer/index.css` and add inside `:root` block (right after `--ring`):

```css
    --popover: 240 8% 8%;
    --popover-foreground: 0 0% 98%;
```

- [ ] **Step 8: Extend tailwind config with popover colors**

Open `tailwind.config.cjs`. Inside the `extend.colors` object, add:

```js
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/ui src/renderer/index.css tailwind.config.cjs package.json pnpm-lock.yaml
git commit -m "feat(ui): dialog, input, label, textarea, select primitives"
```

---

## Task 9: Project status badge component

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\ProjectStatusBadge.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ProjectStatus } from '@shared/types';

const VARIANT: Record<ProjectStatus, BadgeProps['variant']> = {
  active: 'success',
  planning: 'default',
  needs_cleanup: 'warning',
  critical: 'destructive',
  archived: 'secondary'
};

const LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  planning: 'Planning',
  needs_cleanup: 'Needs Cleanup',
  critical: 'Critical',
  archived: 'Archived'
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/projects/ProjectStatusBadge.tsx
git commit -m "feat(projects): status badge component"
```

---

## Task 10: useProjects query hooks

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\useProjects.ts`

- [ ] **Step 1: Write the hooks file**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch } from '@shared/types';

const PROJECTS_KEY = ['projects'] as const;
const projectKey = (id: string) => ['projects', id] as const;

export function useProjectList(q: ProjectListQuery = {}) {
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', q],
    queryFn: () => api.projects.list(q)
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? projectKey(id) : ['projects', '__none__'],
    queryFn: () => (id ? api.projects.get(id) : Promise.resolve(null)),
    enabled: !!id
  });
}

export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, allowDuplicate }: { input: ProjectInput; allowDuplicate?: boolean }) =>
      api.projects.add(input, allowDuplicate),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectPatch>({
    mutationFn: (patch) => api.projects.update(patch),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.setQueryData(projectKey(p.id), p);
    }
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUnarchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.unarchive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useRemoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/projects/useProjects.ts
git commit -m "feat(projects): tanstack-query hooks for project CRUD"
```

---

## Task 11: AddProjectButton dialog (with duplicate handling)

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\DuplicatePathDialog.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\AddProjectButton.tsx`

- [ ] **Step 1: Write `DuplicatePathDialog.tsx`**

```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Project } from '@shared/types';

interface Props {
  existing: Project | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicatePathDialog({ existing, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={!!existing} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Path already registered</DialogTitle>
          <DialogDescription>
            This folder is already tracked as <span className="font-medium">{existing?.name}</span>. Add it again anyway?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Add Again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `AddProjectButton.tsx`**

```tsx
import { useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAddProject } from './useProjects';
import { DuplicatePathDialog } from './DuplicatePathDialog';
import type { Project, ProjectInput } from '@shared/types';

interface FormState {
  name: string;
  description: string;
  category: string;
  tags: string;
  localPath: string;
}

const empty: FormState = { name: '', description: '', category: '', tags: '', localPath: '' };

export function AddProjectButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [duplicate, setDuplicate] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addMut = useAddProject();

  function reset() {
    setForm(empty);
    setError(null);
    setDuplicate(null);
  }

  async function pickFolder() {
    setError(null);
    const result = await api.projects.pickFolder();
    if (!result.canceled && result.path) {
      setForm((f) => ({
        ...f,
        localPath: result.path!,
        name: f.name || result.path!.split(/[\\/]/).pop() || ''
      }));
    }
  }

  function buildInput(): ProjectInput {
    return {
      name: form.name.trim(),
      localPath: form.localPath.trim(),
      description: form.description.trim() || undefined,
      category: form.category.trim() || undefined,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean)
    };
  }

  async function submit(allowDuplicate = false) {
    setError(null);
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.localPath.trim()) return setError('Pick a folder.');
    try {
      await addMut.mutateAsync({ input: buildInput(), allowDuplicate });
      setOpen(false);
      reset();
    } catch (err) {
      const e = err as Error & { code?: string; meta?: { existing?: Project } };
      if (e.code === 'DUPLICATE_PATH' && e.meta?.existing) {
        setDuplicate(e.meta.existing);
        return;
      }
      setError(e.message ?? 'Failed to add project.');
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Project
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project</DialogTitle>
            <DialogDescription>Register a local folder. VibeOps does not modify or copy files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder">Folder</Label>
              <div className="flex gap-2">
                <Input id="folder" readOnly value={form.localPath} placeholder="C:\path\to\project" />
                <Button type="button" variant="outline" onClick={pickFolder}>
                  <Folder className="h-4 w-4" /> Browse
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat">Category</Label>
                <Input id="cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={() => submit(false)} disabled={addMut.isPending}>
              {addMut.isPending ? 'Adding…' : 'Add Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DuplicatePathDialog
        existing={duplicate}
        onCancel={() => setDuplicate(null)}
        onConfirm={() => { setDuplicate(null); void submit(true); }}
      />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/projects/DuplicatePathDialog.tsx src/renderer/features/projects/AddProjectButton.tsx
git commit -m "feat(projects): Add Project flow with folder picker and duplicate handling"
```

---

## Task 12: ProjectTable

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\ProjectTable.tsx`

- [ ] **Step 1: Write the table**

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { useProjectList } from './useProjects';
import type { Project } from '@shared/types';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

const columns: ColumnDef<Project>[] = [
  {
    header: 'Project',
    accessorKey: 'name',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.name}</div>
        <div className="text-xs text-muted-foreground truncate max-w-[28rem]">{row.original.localPath}</div>
      </div>
    )
  },
  {
    header: 'Stack',
    accessorKey: 'primaryStack',
    cell: ({ row }) => row.original.primaryStack ?? <span className="text-muted-foreground">—</span>
  },
  {
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />
  },
  { header: 'Last Scan', accessorKey: 'lastScannedAt', cell: ({ row }) => fmtDate(row.original.lastScannedAt) },
  { header: 'Last Audit', accessorKey: 'lastAuditedAt', cell: ({ row }) => fmtDate(row.original.lastAuditedAt) }
];

interface Props {
  includeArchived?: boolean;
}

export function ProjectTable({ includeArchived = false }: Props) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjectList({
    search: search || undefined,
    includeArchived
  });

  const data = useMemo(() => projects, [projects]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name or path"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">No projects yet.</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-border hover:bg-secondary/40 cursor-pointer"
                  onClick={() => navigate(`/projects/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${row.original.id}`);
                    }}>Open</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/projects/ProjectTable.tsx
git commit -m "feat(projects): TanStack-Table project list with search and row navigation"
```

---

## Task 13: Wire dashboard + projects route

**Files:**
- Modify: `E:\Projects\VibeOps\src\renderer\routes\DashboardRoute.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\ProjectsRoute.tsx`

- [ ] **Step 1: Replace `DashboardRoute.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';
import { useProjectList } from '@/features/projects/useProjects';

export function DashboardRoute() {
  const { data: projects = [] } = useProjectList({ includeArchived: true });
  const stats = [
    { label: 'Total Projects', value: projects.length },
    { label: 'Active', value: projects.filter((p) => p.status === 'active').length },
    { label: 'Archived', value: projects.filter((p) => p.status === 'archived').length },
    { label: 'Critical', value: projects.filter((p) => p.status === 'critical').length }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
        </div>
        <AddProjectButton />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Project Workspace</CardTitle></CardHeader>
        <CardContent><ProjectTable /></CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Replace `ProjectsRoute.tsx`**

```tsx
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';

export function ProjectsRoute() {
  const [includeArchived, setIncludeArchived] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">All registered local project folders.</p>
        </div>
        <AddProjectButton />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>All Projects</span>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Include archived
            </Label>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTable includeArchived={includeArchived} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/DashboardRoute.tsx src/renderer/routes/ProjectsRoute.tsx
git commit -m "feat(routes): live project table on dashboard and projects route"
```

---

## Task 14: Project detail route + edit/archive/remove

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectDetailRoute.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectOverviewTab.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\EditProjectDialog.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\App.tsx`

- [ ] **Step 1: Write `EditProjectDialog.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useUpdateProject } from './useProjects';
import type { Project, ProjectStatus } from '@shared/types';

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'planning', label: 'Planning' },
  { value: 'needs_cleanup', label: 'Needs Cleanup' },
  { value: 'critical', label: 'Critical' },
  { value: 'archived', label: 'Archived' }
];

interface Props {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProjectDialog({ project, open, onOpenChange }: Props) {
  const update = useUpdateProject();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [category, setCategory] = useState(project.category ?? '');
  const [tags, setTags] = useState(project.tags.join(', '));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(project.name);
      setDescription(project.description ?? '');
      setCategory(project.category ?? '');
      setTags(project.tags.join(', '));
      setStatus(project.status);
      setError(null);
    }
  }, [open, project]);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Name required.');
    try {
      await update.mutateAsync({
        id: project.id,
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        status
      });
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write `ProjectOverviewTab.tsx`**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@shared/types';
import { ProjectStatusBadge } from '@/features/projects/ProjectStatusBadge';

function row(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-border py-2 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">{value}</div>
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  return (
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
        {row('Stack', project.primaryStack ?? '— (run scan in Phase 2)')}
        {row('Last Scan', project.lastScannedAt ?? 'Never')}
        {row('Last Audit', project.lastAuditedAt ?? 'Never')}
        {row('Created', new Date(project.createdAt).toLocaleString())}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Write `ProjectDetailRoute.tsx`**

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Archive, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProject, useArchiveProject, useUnarchiveProject, useRemoveProject } from '@/features/projects/useProjects';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { ProjectOverviewTab } from './ProjectOverviewTab';

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
      <ProjectOverviewTab project={project} />
      <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
```

- [ ] **Step 4: Wire route in `src/renderer/App.tsx`**

Replace contents:

```tsx
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardRoute } from '@/routes/DashboardRoute';
import { ProjectsRoute } from '@/routes/ProjectsRoute';
import { ProjectDetailRoute } from '@/routes/projects/ProjectDetailRoute';
import { MemoryRoute } from '@/routes/MemoryRoute';
import { AuditsRoute } from '@/routes/AuditsRoute';
import { TasksRoute } from '@/routes/TasksRoute';
import { ChatRoute } from '@/routes/ChatRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardRoute /> },
      { path: 'projects', element: <ProjectsRoute /> },
      { path: 'projects/:id', element: <ProjectDetailRoute /> },
      { path: 'memory', element: <MemoryRoute /> },
      { path: 'audits', element: <AuditsRoute /> },
      { path: 'tasks', element: <TasksRoute /> },
      { path: 'chat', element: <ChatRoute /> },
      { path: 'settings', element: <SettingsRoute /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/routes/projects src/renderer/features/projects/EditProjectDialog.tsx src/renderer/App.tsx
git commit -m "feat(projects): detail route with edit, archive, remove actions"
```

---

## Task 15: Phase 1 acceptance check

**Files:** none (validation step)

- [ ] **Step 1: Run quality gate**

Run: `pnpm build:typecheck && pnpm test && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Manual flow against PRD §10.4**

Run: `pnpm dev`
Verify in app:
- Click Add Project → folder picker opens (native dialog, NOT a renderer file input).
- Pick a real folder → form pre-fills name from folder basename.
- Submit → project appears in dashboard table immediately.
- Restart app (close window, `pnpm dev` again) → project still listed (persistence).
- Try adding the same folder again → DuplicatePathDialog appears. Cancel → no second row added. Add Again → second row appears (PRD §10.3.4 — confirmation gate honored).
- Click row → detail page opens with metadata.
- Edit → name change persists after close.
- Archive → status badge changes; row hides on dashboard, visible only with "Include archived" toggle on Projects route.
- Unarchive → flips back.
- Remove → row gone, but the actual folder on disk is still present (PRD §10.4 — non-destructive remove).
- Pick a path that doesn't exist (rare via picker, but try via dev tools: `await window.vibeops.projects.add({ name: 'X', localPath: 'Z:/not/real' })`) → error surfaces with code `INVALID_PATH`.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a phase-1 -m "Phase 1 complete: project registry"
```

---

## Self-Review Notes

- **Spec coverage (PRD §10.4):** Add ✓, dashboard ✓, persistence ✓, duplicate confirmation ✓, remove leaves files ✓.
- **Type consistency:** `Project.tags: string[]` shared between renderer and main; serialized as JSON in DB column. `ProjectsRepo.takenSlugs()` matches name used in `ProjectsService.add`. `IpcChannels.projectsArchive` matches handler + preload + hook chain.
- **Risks:** Path normalization uses `path.resolve`. On Windows, case-insensitive filesystems may still allow `C:\Foo` and `c:\foo` to refer to the same folder but compare unequal. PRD §10.3.4 says "detect duplicate project paths" — Phase 1 catches exact-string matches; case-insensitive duplicate detection deferred to Phase 2 scanner (which already touches the filesystem).
- **Renderer security:** every fs touch goes through `dialog.showOpenDialog` in main. Renderer never reads or writes paths.
- **Tag format:** `tags` field is JSON-serialized at the repo boundary. Renderer always sees `string[]`.
