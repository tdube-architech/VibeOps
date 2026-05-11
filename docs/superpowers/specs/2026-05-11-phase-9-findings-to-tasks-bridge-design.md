# Phase 9 — Findings → Tasks Bridge Design

**Date:** 2026-05-11
**Status:** Approved (brainstorm)
**Scope:** Auto-create board tasks from audit findings after every audit completes. Dedupe across re-audits via stable signature. Renderer-side bridge so the existing cloud/local task data layer routes correctly. Toast feedback only.

## Goal

Close the loop between audit (findings) and tasks (kanban). Every actionable finding gets a triaged task automatically; reruns do not duplicate; info-level findings stay out of the board.

## Behaviour summary

- **Trigger:** every successful `runAudit` IPC call.
- **Severity scope:** create tasks for `critical | high | medium | low`. Skip `info`.
- **Mapping:** severity → priority is identity (`critical → critical`, …, `low → low`).
- **Status of new tasks:** `backlog`.
- **Dedupe:** signature-based. If a non-trashed task already exists for the project with the same `source_signature`, skip. No regression reopens. No auto-resolution of stale tasks.
- **Feedback:** single toast `"Audit created N tasks"`. Click → `/tasks?project=<id>`.

## Data flow

```
runAudit IPC → AuditRun { findings[] }
  ↓
useRunAudit.onSuccess
  ↓
runFindingsBridge({ listTasks, createTask, projectId, findings })
  ↓
filter severity != 'info'
fetch existing non-trashed tasks once → Set<source_signature>
for each kept finding:
    sig = findingSignature(f)
    if sig in set → skipped++
    else → createTask({ projectId, title, description, priority, suggestedPrompt, sourceFindingId, sourceSignature: sig, relatedFiles, status: 'backlog' })
       created++
  ↓
toast.success(`Audit created ${created} tasks`, …) → click → /tasks?project=<id>
```

## Components

### 1. Pure helpers (shared)

`src/shared/finding-signature.ts`:

```ts
export function findingSignature(f: {
  category: string;
  title: string;
  filePath: string | null;
  lineStart: number | null;
}): string {
  return [f.category, f.filePath ?? '-', f.lineStart ?? 0, f.title].join('|');
}
```

`src/shared/finding-to-task.ts`:

```ts
import type { FindingSeverity, TaskPriority } from './types';

export const FINDING_TO_PRIORITY: Record<FindingSeverity, TaskPriority | null> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: null
};
```

Both pure, no IO, fully unit-testable.

### 2. Schema

**Cloud — `supabase/migrations/0035_tasks_source_signature.sql`:**

```sql
alter table public.tasks add column if not exists source_signature text;

create index if not exists idx_tasks_project_source_signature
  on public.tasks (project_id, source_signature)
  where deleted_at is null;
```

**Local — `drizzle/0008_tasks_source_signature.sql`:**

```sql
ALTER TABLE `tasks` ADD COLUMN `source_signature` text;
CREATE INDEX `idx_tasks_project_source_signature`
  ON `tasks` (`project_id`, `source_signature`);
```

(Local SQLite indexes don't take partial-where clauses cleanly across all versions; full index is safe and small.)

### 3. Shared type extension

`src/shared/types.ts`:

- `Task.sourceSignature: string | null`
- `TaskInput.sourceSignature?: string`

### 4. Data layer

- `src/renderer/lib/data/tasks.ts` — `rowToTask` mapper picks up new column; `createTask` writes it; `listTasks` returns it.
- `src/main/tasks/repo.ts` — local SQLite repo mirrors the same shape.

### 5. Bridge

`src/renderer/features/tasks/findingsBridge.ts`:

```ts
interface BridgeDeps {
  listTasks: (q: { projectId: string }) => Promise<Task[]>;
  createTask: (input: TaskInput) => Promise<Task>;
}

interface BridgeResult { created: number; skipped: number; failed: number }

export async function runFindingsBridge(
  deps: BridgeDeps,
  projectId: string,
  findings: AuditFinding[]
): Promise<BridgeResult>
```

- Filters `info` severity findings out.
- One `listTasks` call, builds `Set<string>` of `source_signature` (drops nulls).
- Per finding: compute sig, skip if matched, else build `TaskInput` and call `createTask`.
- `Promise.allSettled` across creates; counts created/skipped/failed.
- Returns counts; never throws on individual create failures (logged).

### 6. Hook wiring

`src/renderer/features/audit/useRunAudit.ts` (or wherever `runAudit` mutation lives):

```ts
onSuccess: async (audit, { projectId }) => {
  // existing invalidations
  const result = await runFindingsBridge({ listTasks, createTask }, projectId, audit.findings);
  if (result.created > 0) {
    toast.success(
      `Audit created ${result.created} tasks`,
      'Open Tasks board',
      () => navigate(`/tasks?project=${projectId}`)
    );
  }
}
```

(Adapt to the actual toast helper signature.)

### 7. Tests

- `tests/shared/finding-signature.test.ts`
  - all-null path values → `'cat|-|0|title'`
  - identical inputs → identical output (determinism)
  - lineStart differing → different sigs
- `tests/shared/finding-to-task.test.ts`
  - `critical`/`high`/`medium`/`low` map to identity
  - `info` maps to `null`
- `tests/renderer/findings-bridge.test.ts` (or `tests/shared/findings-bridge.test.ts` if pure enough)
  - empty board + [info, low, medium] → creates 2 (info filtered)
  - board has open task with matching sig → skipped
  - board has done task with matching sig → skipped
  - board has trashed task (deletedAt set) — listTasks won't return it → bridge creates new
  - createTask fails on one → others still created, `failed=1`

## Edge cases

- **Audit fails mid-run:** bridge not invoked. Existing tasks untouched.
- **Network failure on createTask:** logged, counted in `failed`. Other creates proceed.
- **Two audits in quick succession:** second sees first's tasks via signature. No transaction needed; dedupe is per-call.
- **Architecture-level finding without filePath/lineStart:** signature uses `'-'` and `0`. Multiple same-title arch findings collapse to one task. Acceptable.
- **User trashes a bridge-created task:** task soft-deleted. Next audit re-creates because `listTasks` excludes trashed. To suppress, user moves task to `ignored` status (kept in sig lookup).
- **Local-only project:** `createTask` routes to local SQLite repo. Same bridge code.
- **Cloud project + workspace member without project access:** RLS rejects createTask. Bridge logs, counts as `failed`.
- **Audit returns 0 findings:** bridge runs, creates 0, no toast.

## Out of scope

- Auto-resolve / regression reopen (rejected during brainstorm Q3 — chose A, neither).
- Per-project severity threshold setting (rejected Q2 — chose B, identity map).
- Manual per-finding "Create task" button (rejected Q1 — chose A, auto only).
- Per-task notification bell entries (rejected Q5 — chose A, toast only).
- Linking task back to audit run history (no audit_run_id on task).

## Risk

- Bulk createTask under RLS triggers N round-trips. Worst case: 50 findings → 50 INSERTs. Acceptable for v1; if slow, batch RPC later.
- Signature based on `title` is unstable if rule authors rename a finding's title between rule-pack versions. Trade-off: simple + lossy vs schema-dependent. Document in spec; revisit if false-dup rate observed.
- Migration numbering must remain monotonic: cloud `0035` (after `0034_tasks_position`; `0031` reserved-skipped earlier remains skipped), local drizzle `0008` (after `0007_drop_local_path_unique`).

## Acceptance

1. `pnpm test` green (existing 162 + new tests).
2. `pnpm build:typecheck` + `pnpm build` green.
3. Manual: run a fresh audit on a project — board populates with non-info findings as `backlog` tasks. Toast appears. Click toast → Tasks board with project filter.
4. Manual: re-run audit on same project — no duplicate tasks created. Toast NOT shown (suppressed when `created === 0`).
5. Cloud + local projects both work.
