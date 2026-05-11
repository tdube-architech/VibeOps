# Phase 9 — Findings → Tasks Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every successful audit, batch-create board tasks from new findings (severity ≥ low). Dedupe across re-audits via stable signature. Renderer-side bridge wired into `useStartAudit` `onSuccess`.

**Architecture:** Two pure helpers in `src/shared/`, schema column `source_signature` on both cloud + local task tables, renderer bridge fn that consumes `AuditRun.findings` and calls existing `createTask` data layer, hook chained onto `useStartAudit`.

**Tech Stack:** TypeScript, Supabase Postgres (cloud `public.tasks`), drizzle + better-sqlite3 (local `project_tasks`), vitest, TanStack Query, shadcn-style toast.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-9-findings-to-tasks-bridge-design.md`

---

## File Structure

**Create:**
- `src/shared/finding-signature.ts` — pure `findingSignature(...)` fn.
- `src/shared/finding-to-task.ts` — `FINDING_TO_PRIORITY` map (`info → null`).
- `src/renderer/features/tasks/findingsBridge.ts` — orchestration fn.
- `supabase/migrations/0035_tasks_source_signature.sql` — cloud schema.
- `drizzle/0008_tasks_source_signature.sql` — local schema.
- `tests/shared/finding-signature.test.ts`
- `tests/shared/finding-to-task.test.ts`
- `tests/renderer/findings-bridge.test.ts`

**Modify:**
- `src/shared/types.ts` — extend `Task` + `TaskInput`.
- `src/renderer/lib/data/tasks.ts` — `TaskRow`, `rowToTask`, `createTask` write path.
- `src/main/tasks/repo.ts` — `toTask` + insert path.
- `src/main/db/schema.ts` — add `sourceSignature` column to `projectTasks`.
- `src/renderer/features/projects/useAudits.ts` — invoke bridge inside `useStartAudit` `onSuccess`; show toast.

**Untouched:**
- Audit run pipeline (`src/main/audit/index.ts`) — bridge runs after, not inside.
- Other test fixtures.

---

# PHASE A — Pure helpers (TDD)

## Task A1: `findingSignature` helper

**Files:**
- Create: `src/shared/finding-signature.ts`
- Create: `tests/shared/finding-signature.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/shared/finding-signature.test.ts
import { describe, it, expect } from 'vitest';
import { findingSignature } from '../../src/shared/finding-signature';

describe('findingSignature', () => {
  it('joins category | filePath | lineStart | title', () => {
    expect(findingSignature({
      category: 'security',
      title: 'Hardcoded API key',
      filePath: 'app/page.tsx',
      lineStart: 12
    })).toBe('security|app/page.tsx|12|Hardcoded API key');
  });

  it('falls back to "-" when filePath null and 0 when lineStart null', () => {
    expect(findingSignature({
      category: 'architecture',
      title: 'mixes /app and /pages',
      filePath: null,
      lineStart: null
    })).toBe('architecture|-|0|mixes /app and /pages');
  });

  it('produces identical output for identical inputs (deterministic)', () => {
    const a = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    const b = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    expect(a).toBe(b);
  });

  it('differs when lineStart differs', () => {
    const a = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 1 });
    const b = findingSignature({ category: 'x', title: 't', filePath: 'f', lineStart: 2 });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shared/finding-signature.test.ts`
Expected: FAIL — `Cannot find module '../../src/shared/finding-signature'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/finding-signature.ts
export function findingSignature(f: {
  category: string;
  title: string;
  filePath: string | null;
  lineStart: number | null;
}): string {
  return [f.category, f.filePath ?? '-', f.lineStart ?? 0, f.title].join('|');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shared/finding-signature.test.ts`
Expected: PASS — 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/shared/finding-signature.ts tests/shared/finding-signature.test.ts
git commit -m "feat(shared): findingSignature helper for tasks dedupe"
```

---

## Task A2: severity → priority map

**Files:**
- Create: `src/shared/finding-to-task.ts`
- Create: `tests/shared/finding-to-task.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/shared/finding-to-task.test.ts
import { describe, it, expect } from 'vitest';
import { FINDING_TO_PRIORITY } from '../../src/shared/finding-to-task';

describe('FINDING_TO_PRIORITY', () => {
  it('identity-maps actionable severities', () => {
    expect(FINDING_TO_PRIORITY.critical).toBe('critical');
    expect(FINDING_TO_PRIORITY.high).toBe('high');
    expect(FINDING_TO_PRIORITY.medium).toBe('medium');
    expect(FINDING_TO_PRIORITY.low).toBe('low');
  });

  it('returns null for info severity (skip signal)', () => {
    expect(FINDING_TO_PRIORITY.info).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/shared/finding-to-task.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/shared/finding-to-task.ts
import type { FindingSeverity, TaskPriority } from './types';

export const FINDING_TO_PRIORITY: Record<FindingSeverity, TaskPriority | null> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: null
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/shared/finding-to-task.test.ts`
Expected: PASS — 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/shared/finding-to-task.ts tests/shared/finding-to-task.test.ts
git commit -m "feat(shared): FINDING_TO_PRIORITY map (info → null)"
```

---

# PHASE B — Schema

## Task B1: Cloud migration `0035_tasks_source_signature`

**Files:**
- Create: `supabase/migrations/0035_tasks_source_signature.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add source_signature for findings→tasks dedupe across audit runs.
alter table public.tasks add column if not exists source_signature text;

create index if not exists idx_tasks_project_source_signature
  on public.tasks (project_id, source_signature)
  where deleted_at is null;
```

- [ ] **Step 2: Apply to local Supabase dev DB**

Run (interactive — user-driven if `supabase db push` requires confirmation):
```bash
supabase db push
```
Expected: migration 0035 listed as applied. Confirm by:
```bash
supabase db diff
```
Expected: empty.

If working without local Supabase, document in commit message and rely on CI/staging apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0035_tasks_source_signature.sql
git commit -m "feat(db/cloud): tasks.source_signature column + partial index"
```

---

## Task B2: Local SQLite drizzle migration `0008_tasks_source_signature`

**Files:**
- Create: `drizzle/0008_tasks_source_signature.sql`
- Modify: `src/main/db/schema.ts` — append column to `projectTasks` table.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE `project_tasks` ADD COLUMN `source_signature` text;
CREATE INDEX `idx_project_tasks_source_signature`
  ON `project_tasks` (`project_id`, `source_signature`);
```

(Local index is full, not partial. SQLite partial indexes work but keep this simple.)

- [ ] **Step 2: Add column to drizzle schema**

In `src/main/db/schema.ts`, find the `projectTasks` definition. Add `sourceSignature: text('source_signature'),` next to the existing `sourceFindingId` line. Exact location (line ~174):

```ts
export const projectTasks = sqliteTable('project_tasks', {
  // ...existing fields...
  sourceFindingId: text('source_finding_id'),
  sourceSignature: text('source_signature'),
  // ...rest...
});
```

- [ ] **Step 3: Run migration locally + confirm**

```bash
pnpm db:migrate
```
Expected: 0008 applies. No error.

Confirm via:
```bash
node -e "const Database = require('better-sqlite3'); const path = require('node:path'); const os = require('node:os'); const db = new Database(path.join(os.homedir(), 'AppData', 'Roaming', 'vibeops', 'vibeops.db')); console.log(db.prepare('pragma table_info(project_tasks)').all().map(c => c.name)); db.close();"
```
Expected: array includes `source_signature`.

(If running tests with the rebuilt-for-node binding from phase 7.5, run `pnpm test` first to swap to node ABI; restore via `node scripts/rebuild-sqlite.mjs --runtime=electron` after this verification.)

- [ ] **Step 4: Commit**

```bash
git add drizzle/0008_tasks_source_signature.sql src/main/db/schema.ts
git commit -m "feat(db/local): project_tasks.source_signature + drizzle schema"
```

---

# PHASE C — Types + data layer

## Task C1: Extend shared `Task` + `TaskInput` types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add `sourceSignature` to `Task` interface**

Find the `Task` interface (currently lines 49-67). Add `sourceSignature: string | null;` right after `sourceFindingId`:

```ts
export interface Task {
  id: string;
  projectId: string;
  sourceFindingId: string | null;
  sourceSignature: string | null;
  // ...rest unchanged...
}
```

- [ ] **Step 2: Add `sourceSignature` to `TaskInput` interface**

Find the `TaskInput` interface (currently lines 69-77). Add `sourceSignature?: string;`:

```ts
export interface TaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  relatedFiles?: string[];
  suggestedPrompt?: string;
  sourceFindingId?: string;
  sourceSignature?: string;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build:typecheck`
Expected: PASS. (May surface needed updates in data layer — those are the next tasks. If errors, expect them to be in `src/renderer/lib/data/tasks.ts` and `src/main/tasks/repo.ts` only.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): Task.sourceSignature for findings dedupe"
```

---

## Task C2: Cloud task data layer

**Files:**
- Modify: `src/renderer/lib/data/tasks.ts`

- [ ] **Step 1: Add `source_signature` to `TaskRow`**

Find `interface TaskRow` (lines 8-26). Add `source_signature: string | null;` right after `source_finding_id`:

```ts
interface TaskRow {
  // ...existing fields...
  source_finding_id: string | null;
  source_signature: string | null;
  // ...rest...
}
```

- [ ] **Step 2: Update `rowToTask` mapper**

Find `function rowToTask` (line 39). Add `sourceSignature: row.source_signature,` after `sourceFindingId`:

```ts
function rowToTask(row: TaskRow): Task {
  const t: Task = {
    id: row.id,
    projectId: row.project_id,
    sourceFindingId: row.source_finding_id,
    sourceSignature: row.source_signature,
    title: row.title,
    // ...rest unchanged...
  };
  if (row.version !== undefined) t.version = row.version;
  return t;
}
```

- [ ] **Step 3: Update cloud `createTask` write path**

Find `createTask` (line 112). Add `source_signature` to the row map (after `source_finding_id`):

```ts
const row: Record<string, unknown> = {
  project_id: input.projectId,
  workspace_id: workspaceId,
  title: input.title,
  description: input.description ?? null,
  priority: input.priority ?? 'medium',
  status: 'backlog' as TaskStatus,
  related_files: input.relatedFiles ?? [],
  suggested_prompt: input.suggestedPrompt ?? null,
  source_finding_id: input.sourceFindingId ?? null,
  source_signature: input.sourceSignature ?? null,
  created_by: userId
};
```

- [ ] **Step 4: Update `createTaskFromFinding` to also write signature**

Find `createTaskFromFinding` (line 136). Inside, after fetching `f` (the finding row), compute the signature and add to the inserted row. Replace the existing `row` build with:

```ts
const sig = [f.severity === 'critical' ? 'security' : 'unknown', f.file_path ?? '-', 0, f.title].join('|');
// NOTE: schema for audit_findings doesn't return category in this fetch. To keep dedupe
// consistent with the bridge, the bridge handles signature; this single-finding helper
// records null. The bridge always wins for re-audit dedupe.
const row: Record<string, unknown> = {
  project_id: f.project_id,
  workspace_id: f.workspace_id,
  source_finding_id: f.id,
  source_signature: null,
  // ...rest unchanged...
};
```

Actually — simpler: leave `createTaskFromFinding` writing `source_signature: null`. The bridge is the canonical writer of signatures; the manual single-finding helper is the legacy path that pre-dates dedupe. Make the change minimal:

```ts
const row: Record<string, unknown> = {
  project_id: f.project_id,
  workspace_id: f.workspace_id,
  source_finding_id: f.id,
  source_signature: null,
  title: f.title,
  description: [f.description, f.recommendation ? `\n\n**Recommendation:** ${f.recommendation}` : ''].filter(Boolean).join(''),
  priority,
  status: 'backlog' as TaskStatus,
  related_files: f.file_path ? [f.file_path] : [],
  suggested_prompt: f.suggested_prompt,
  created_by: userId
};
```

(Delete the speculative `sig` calculation from the previous suggestion. The line shown above is the FINAL state of `row` in `createTaskFromFinding`.)

- [ ] **Step 5: Typecheck**

Run: `pnpm build:typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/data/tasks.ts
git commit -m "feat(data/cloud): tasks source_signature in row, mapper, create path"
```

---

## Task C3: Local task data layer

**Files:**
- Modify: `src/main/tasks/repo.ts`

- [ ] **Step 1: Add to `toTask` mapper**

Find `function toTask(row: ProjectTaskRow): Task` (line 6). Add `sourceSignature: row.sourceSignature ?? null,` after the existing `sourceFindingId` line:

```ts
function toTask(row: ProjectTaskRow): Task {
  return {
    // ...existing fields...
    sourceFindingId: row.sourceFindingId,
    sourceSignature: row.sourceSignature ?? null,
    // ...rest...
  };
}
```

(Schema's `sourceSignature` is nullable text so type is `string | null`; the `?? null` is defensive for older rows.)

- [ ] **Step 2: Add to insert path**

Find the `insert` method (around line 35). Add `sourceSignature: args.sourceSignature ?? null,` to the values object:

```ts
this.db.insert(projectTasks).values({
  // ...existing fields...
  sourceFindingId: args.sourceFindingId ?? null,
  sourceSignature: args.sourceSignature ?? null,
  // ...rest...
});
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build:typecheck`
Expected: PASS.

- [ ] **Step 4: Run existing local-task tests to confirm no regression**

Run: `pnpm vitest run tests/main/projects-repo.test.ts`
Expected: PASS (no task tests in that file, but ensures nothing else broke).

Run: `pnpm vitest run tests/main/db.test.ts`
Expected: PASS.

(If a tasks-specific test file exists, run it too: `find tests/main -name "tasks*"`.)

- [ ] **Step 5: Commit**

```bash
git add src/main/tasks/repo.ts
git commit -m "feat(data/local): projectTasks source_signature in mapper + insert"
```

---

# PHASE D — Bridge

## Task D1: `runFindingsBridge` + tests

**Files:**
- Create: `src/renderer/features/tasks/findingsBridge.ts`
- Create: `tests/renderer/findings-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/findings-bridge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { runFindingsBridge } from '../../src/renderer/features/tasks/findingsBridge';
import { findingSignature } from '../../src/shared/finding-signature';
import type { AuditFinding, Task, TaskInput } from '../../src/shared/types';

function makeFinding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'fnd_' + Math.random().toString(36).slice(2),
    auditRunId: 'aud_x',
    projectId: 'proj_x',
    severity: 'medium',
    category: 'security',
    title: 'Hardcoded API key',
    description: null,
    filePath: 'app/page.tsx',
    lineStart: 12,
    lineEnd: null,
    recommendation: null,
    suggestedPrompt: null,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...over
  } as AuditFinding;
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'tsk_' + Math.random().toString(36).slice(2),
    projectId: 'proj_x',
    sourceFindingId: null,
    sourceSignature: null,
    title: 't',
    description: null,
    priority: 'medium',
    status: 'backlog',
    assigneeUserId: null,
    relatedFiles: [],
    suggestedPrompt: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    deletedAt: null,
    position: null,
    ...over
  };
}

describe('runFindingsBridge', () => {
  it('creates tasks for actionable findings; skips info', async () => {
    const created: TaskInput[] = [];
    const listTasks = vi.fn().mockResolvedValue([]);
    const createTask = vi.fn(async (input: TaskInput) => { created.push(input); return makeTask({ projectId: input.projectId, title: input.title }); });

    const findings = [
      makeFinding({ severity: 'info', title: 'Stack: Next 14' }),
      makeFinding({ severity: 'medium', title: 'Missing rate limit' }),
      makeFinding({ severity: 'critical', title: 'SQL injection' })
    ];

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', findings);

    expect(result).toEqual({ created: 2, skipped: 0, failed: 0 });
    expect(created.map(c => c.title).sort()).toEqual(['Missing rate limit', 'SQL injection']);
    expect(created.find(c => c.title === 'SQL injection')?.priority).toBe('critical');
  });

  it('skips findings whose signature matches an existing non-trashed task', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const sig = findingSignature({ category: f.category, title: f.title, filePath: f.filePath, lineStart: f.lineStart });
    const existing = makeTask({ sourceSignature: sig, status: 'backlog' });
    const listTasks = vi.fn().mockResolvedValue([existing]);
    const createTask = vi.fn();

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(createTask).not.toHaveBeenCalled();
  });

  it('skips when matching task is in done or ignored status', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const sig = findingSignature({ category: f.category, title: f.title, filePath: f.filePath, lineStart: f.lineStart });
    const existing = makeTask({ sourceSignature: sig, status: 'done' });
    const listTasks = vi.fn().mockResolvedValue([existing]);
    const createTask = vi.fn();

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 0, skipped: 1, failed: 0 });
  });

  it('does NOT see trashed tasks (listTasks excludes them) — creates new', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const listTasks = vi.fn().mockResolvedValue([]); // trashed tasks not returned
    const createTask = vi.fn(async (input: TaskInput) => makeTask({ title: input.title }));

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });
  });

  it('counts failed creates but continues with remaining findings', async () => {
    const fA = makeFinding({ title: 'A', lineStart: 1 });
    const fB = makeFinding({ title: 'B', lineStart: 2 });
    const listTasks = vi.fn().mockResolvedValue([]);
    const createTask = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('RLS')))
      .mockImplementationOnce(async (input: TaskInput) => makeTask({ title: input.title }));

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [fA, fB]);

    expect(result).toEqual({ created: 1, skipped: 0, failed: 1 });
  });

  it('returns zero counts for empty findings', async () => {
    const result = await runFindingsBridge({ listTasks: vi.fn().mockResolvedValue([]), createTask: vi.fn() }, 'proj_x', []);
    expect(result).toEqual({ created: 0, skipped: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/renderer/findings-bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/renderer/features/tasks/findingsBridge.ts
import { findingSignature } from '@shared/finding-signature';
import { FINDING_TO_PRIORITY } from '@shared/finding-to-task';
import type { AuditFinding, Task, TaskInput } from '@shared/types';

export interface BridgeDeps {
  listTasks: (q: { projectId: string }) => Promise<Task[]>;
  createTask: (input: TaskInput) => Promise<Task>;
}

export interface BridgeResult {
  created: number;
  skipped: number;
  failed: number;
}

export async function runFindingsBridge(
  deps: BridgeDeps,
  projectId: string,
  findings: AuditFinding[]
): Promise<BridgeResult> {
  if (findings.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const existing = await deps.listTasks({ projectId });
  const existingSigs = new Set<string>();
  for (const t of existing) {
    if (t.sourceSignature) existingSigs.add(t.sourceSignature);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const toCreate: TaskInput[] = [];
  for (const f of findings) {
    const priority = FINDING_TO_PRIORITY[f.severity];
    if (priority === null) continue;

    const sig = findingSignature({
      category: f.category,
      title: f.title,
      filePath: f.filePath,
      lineStart: f.lineStart
    });
    if (existingSigs.has(sig)) {
      skipped++;
      continue;
    }
    existingSigs.add(sig);

    const description = [
      f.description ?? '',
      f.recommendation ? `\n\n**Recommendation:** ${f.recommendation}` : ''
    ].filter(Boolean).join('');

    const input: TaskInput = {
      projectId,
      title: f.title,
      priority,
      sourceFindingId: f.id,
      sourceSignature: sig,
      relatedFiles: f.filePath ? [f.filePath] : []
    };
    if (description) input.description = description;
    if (f.suggestedPrompt) input.suggestedPrompt = f.suggestedPrompt;
    toCreate.push(input);
  }

  const results = await Promise.allSettled(toCreate.map((input) => deps.createTask(input)));
  for (const r of results) {
    if (r.status === 'fulfilled') created++;
    else failed++;
  }

  return { created, skipped, failed };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/renderer/findings-bridge.test.ts`
Expected: PASS — 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/tasks/findingsBridge.ts tests/renderer/findings-bridge.test.ts
git commit -m "feat(tasks): runFindingsBridge with sig-based dedupe"
```

---

# PHASE E — Wire into useStartAudit

## Task E1: Invoke bridge after audit, show toast

**Files:**
- Modify: `src/renderer/features/projects/useAudits.ts`

- [ ] **Step 1: Add imports + bridge invocation**

At top of `src/renderer/features/projects/useAudits.ts`, add imports:

```ts
import { listTasks, createTask } from '@/lib/data/tasks';
import { runFindingsBridge } from '@/features/tasks/findingsBridge';
```

Find `useStartAudit`'s `onSuccess` callback (around line 55). After the existing `qc.invalidateQueries` calls at the end of the success branch, add:

```ts
try {
  const bridgeDeps = {
    listTasks: (q: { projectId: string }) => listTasks(q),
    createTask: (input: import('@shared/types').TaskInput) => createTask(input, run.workspaceId ?? project.workspaceId ?? '')
  };
  const result = await runFindingsBridge(bridgeDeps, project.id, run.findings ?? []);
  if (result.created > 0) {
    toast.success(
      `Audit created ${result.created} task${result.created === 1 ? '' : 's'}`,
      result.failed > 0 ? `${result.failed} create call(s) failed — check console.` : ''
    );
    qc.invalidateQueries({ queryKey: ['tasks'] });
  }
} catch (e) {
  console.warn('[findings-bridge] failed', e);
}
```

Note: `run.workspaceId` may or may not exist on `AuditRun`. If not, use `project.workspaceId`. The fallback chain `run.workspaceId ?? project.workspaceId ?? ''` keeps the call shape compatible with `createTask`'s second arg.

If your `createTask` signature differs (e.g., infers workspaceId from project), adjust the wrap accordingly. Read `src/renderer/lib/data/tasks.ts:112` for the exact signature before writing.

- [ ] **Step 2: Typecheck**

Run: `pnpm build:typecheck`
Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: PASS (162 existing + 6+2+4 new = 174 total, or close depending on exact A1/A2/D1 counts).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/projects/useAudits.ts
git commit -m "feat(audit): wire findings→tasks bridge into useStartAudit + toast"
```

---

# PHASE F — Acceptance + tag

## Task F1: Manual smoke

**Files:** none modified.

- [ ] **Step 1: Quality gate**

Run from `E:\Projects\VibeOps`:
```bash
pnpm test
pnpm build:typecheck
pnpm build
```
Expected: all green.

- [ ] **Step 2: Manual run — single audit**

```bash
pnpm dev
```

In the app:
1. Open a project that has at least one previous scan.
2. Open the project's Audit tab.
3. Click "Run audit" (or equivalent).
4. Wait for audit to complete.
5. Toast `"Audit created N tasks"` appears.
6. Open Tasks board — confirm N new `backlog` tasks for that project. Priority of each matches finding severity. `sourceFindingId` and `sourceSignature` populated (inspect via Supabase dashboard or `select source_signature from tasks where project_id=…` for cloud projects).

- [ ] **Step 3: Manual run — re-audit (dedupe)**

1. Click "Run audit" again on the same project (no source code change).
2. Wait for completion.
3. Toast NOT shown (created = 0).
4. Tasks board count unchanged.

- [ ] **Step 4: Manual run — local project**

If a local-only project is available:
1. Run audit on it.
2. Toast appears.
3. Open Tasks tab — local tasks (UUID prefix not matching the cloud UUID pattern) appear with `sourceSignature` populated. Verify by stopping the app and inspecting `~/AppData/Roaming/vibeops/vibeops.db`:

```bash
node -e "const Database = require('better-sqlite3'); const db = new Database(require('node:path').join(require('node:os').homedir(), 'AppData', 'Roaming', 'vibeops', 'vibeops.db')); console.log(db.prepare('select source_signature, title from project_tasks where source_signature is not null limit 5').all()); db.close();"
```
Expected: non-empty result.

If you cannot test local: document in the commit message.

- [ ] **Step 5: Stop app**

Ctrl-C the dev server.

---

## Task F2: Spec status + tag + push

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-phase-9-findings-to-tasks-bridge-design.md` (status line only)

- [ ] **Step 1: Flip status**

Change `**Status:** Approved (brainstorm)` to `**Status:** Shipped`.

- [ ] **Step 2: Commit + tag + push**

```bash
git add docs/superpowers/specs/2026-05-11-phase-9-findings-to-tasks-bridge-design.md
git commit -m "docs: mark phase-9 spec shipped"
git tag -a phase-9-findings-tasks -m "Phase 9 complete: findings→tasks bridge with sig dedupe + toast"
git push origin main
git push origin phase-9-findings-tasks
```

---

# Self-Review Notes

**Spec coverage:**
- [x] `findingSignature` — A1.
- [x] `FINDING_TO_PRIORITY` (info → null) — A2.
- [x] Cloud `source_signature` column + index — B1.
- [x] Local `source_signature` column + index — B2.
- [x] Shared types extended — C1.
- [x] Cloud data layer (`TaskRow`, `rowToTask`, `createTask`) — C2.
- [x] Local data layer (`toTask`, insert) — C3.
- [x] Bridge fn `runFindingsBridge` with full dedupe matrix — D1.
- [x] Wire to `useStartAudit` `onSuccess` + toast suppression when 0 — E1.
- [x] Manual acceptance covers single, re-audit, and local path — F1.
- [x] Tag — F2.
- [x] Severity → priority identity map; info skipped — A2 + D1 (FINDING_TO_PRIORITY[severity] === null → continue).

**Placeholder scan:** zero TBDs. C2 Step 4 originally contained a speculative `sig` calculation; corrected inline to "FINAL state of `row`" with `source_signature: null`.

**Type consistency:**
- `Task.sourceSignature: string | null` — defined C1, used C2/C3 mappers + D1 dedupe Set, written by E1.
- `TaskInput.sourceSignature?: string` — defined C1, written by D1 + (null) C2 step 4 + (null) C3.
- `runFindingsBridge` signature `(deps, projectId, findings)` consistent in D1 test + impl + E1 callsite.
- `BridgeResult { created, skipped, failed }` consistent in D1 + E1 usage.

**Risks:**
- B2 Step 3's inspection one-liner depends on better-sqlite3 ABI matching host node. If user runs that command in isolation after `pnpm dev` (electron ABI), it will fail. The plan documents this and routes the user through ABI restoration.
- E1 toast invalidates query key `['tasks']` broadly. If the codebase uses a more specific key, adjust. Verify by grepping for `tasks` queryKey before final commit.
- B1 requires Supabase CLI or staging access. If neither is available, the cloud migration is committed but not applied — flag as user action in F1.

**Out of plan (explicitly):**
- Auto-resolve / regression reopen of tasks.
- Per-project severity threshold setting.
- Manual per-finding "Create task" button (note: the existing `createTaskFromFinding` is left in place; bridge does not replace it. It now writes `source_signature: null`, which means a manually-created task does not participate in dedupe — acceptable trade-off documented in C2 Step 4).
- Schema-aware deduping when title text changes between rule-pack versions.
