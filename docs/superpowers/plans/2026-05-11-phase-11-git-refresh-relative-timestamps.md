# Phase 11 — Git Refresh + Relative Timestamps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App-wide human-friendly relative timestamps via a shared util, and cloud-project `git fetch` + safe `pull --ff-only` ahead of auto-scan, surfaced via a new `git-refresh` pipeline stage.

**Architecture:** Pure `relativeTime` util in `src/renderer/lib/` consumed by all "time since" callsites with `title={iso}` tooltip. `src/main/projects/git-refresh.ts` orchestrator (spawn-injected) invoked from `scanner-handlers.ts` before `runScan` when project is cloud-synced with a local checkout. Soft-fails throughout.

**Tech Stack:** TypeScript, `Intl.RelativeTimeFormat`, vitest, Node `child_process` (spawn via shared util), electron IPC.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-11-git-refresh-relative-timestamps-design.md`

---

## File Structure

**Create:**
- `src/renderer/lib/relative-time.ts` — `relativeTime()` + `RELATIVE_TIME_THRESHOLDS`.
- `tests/renderer/relative-time.test.ts` — tier boundaries, null, future, invalid.
- `src/main/projects/git-refresh.ts` — `refreshGit()` + `GIT_FETCH_TIMEOUT_MS` + types.
- `tests/main/git-refresh.test.ts` — spawn-injected coverage.

**Modify (renderer sweep):**
- `src/renderer/features/activity/ActivityFeed.tsx` — import shared, delete local fn, add `title={iso}`.
- `src/renderer/features/comments/CommentThread.tsx` — same.
- `src/renderer/routes/projects/ProjectOverviewTab.tsx` — Last Scan row.
- `src/renderer/features/projects/ProjectTable.tsx` — Last Scan + Last Audit columns.
- `src/renderer/routes/projects/ProjectAuditsTab.tsx` — Started X.
- `src/renderer/routes/MemoryRoute.tsx` — lastScannedAt.
- `src/renderer/routes/AuditsRoute.tsx` — `audited X` line.
- `src/renderer/features/tasks/TaskCard.tsx` — Created/Completed.
- `src/renderer/features/tasks/TrashView.tsx` — Deleted.

**Modify (main + shared):**
- `src/shared/pipeline-events.ts` — add `'git-refresh'` to `PipelineStage` + `gitRefresh` payload.
- `src/main/pipeline/run.ts` — duplicate type union; mirror the addition.
- `src/main/ipc/scanner-handlers.ts` — invoke `refreshGit` before `runScan` for cloud projects.
- `src/renderer/components/layout/AppShell.tsx` — `STAGE_LABEL['git-refresh']`.

**Untouched:** `useStartScan`, `useAutoScan`, pipeline event consumers besides STAGE_LABEL.

---

# PHASE A — Relative-time util (TDD)

## Task A1: `relativeTime` util + tests

**Files:**
- Create: `src/renderer/lib/relative-time.ts`
- Create: `tests/renderer/relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/relative-time.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { relativeTime, RELATIVE_TIME_THRESHOLDS } from '../../src/renderer/lib/relative-time';

const NOW = Date.parse('2026-05-11T15:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function iso(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

describe('relativeTime', () => {
  it('returns "—" for null', () => {
    expect(relativeTime(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(relativeTime(undefined)).toBe('—');
  });

  it('returns "—" for invalid ISO', () => {
    expect(relativeTime('not a date')).toBe('—');
  });

  it('returns "just now" for ages under 60 seconds', () => {
    expect(relativeTime(iso(0))).toBe('just now');
    expect(relativeTime(iso(30_000))).toBe('just now');
    expect(relativeTime(iso(59_000))).toBe('just now');
  });

  it('returns "just now" for future timestamps (clock skew)', () => {
    expect(relativeTime(iso(-60_000))).toBe('just now');
  });

  it('renders minutes when age is 1m–59m', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.minuteMs))).toMatch(/^2 minutes ago$/);
    expect(relativeTime(iso(59 * RELATIVE_TIME_THRESHOLDS.minuteMs))).toMatch(/^59 minutes ago$/);
  });

  it('renders hours when age is 1h–23h', () => {
    expect(relativeTime(iso(3 * RELATIVE_TIME_THRESHOLDS.hourMs))).toMatch(/^3 hours ago$/);
    expect(relativeTime(iso(23 * RELATIVE_TIME_THRESHOLDS.hourMs))).toMatch(/^23 hours ago$/);
  });

  it('renders days when age is 1d–29d', () => {
    expect(relativeTime(iso(5 * RELATIVE_TIME_THRESHOLDS.dayMs))).toMatch(/^5 days ago$/);
    expect(relativeTime(iso(29 * RELATIVE_TIME_THRESHOLDS.dayMs))).toMatch(/^29 days ago$/);
  });

  it('renders months when age is 1mo–11mo', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.monthMs))).toMatch(/^2 months ago$/);
  });

  it('renders years when age >= 12mo', () => {
    expect(relativeTime(iso(2 * RELATIVE_TIME_THRESHOLDS.yearMs))).toMatch(/^2 years ago$/);
  });
});
```

- [ ] **Step 2: Run (FAIL — module not found)**

```bash
pnpm vitest run tests/renderer/relative-time.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/renderer/lib/relative-time.ts
export const RELATIVE_TIME_THRESHOLDS = {
  justNowMs: 60_000,
  minuteMs: 60_000,
  hourMs: 60 * 60_000,
  dayMs: 24 * 60 * 60_000,
  monthMs: 30 * 24 * 60 * 60_000,
  yearMs: 365 * 24 * 60 * 60_000
} as const;

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' });

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Date.now() - t;
  if (ms < RELATIVE_TIME_THRESHOLDS.justNowMs) return 'just now';
  if (ms < RELATIVE_TIME_THRESHOLDS.hourMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.minuteMs), 'minute');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.dayMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.hourMs), 'hour');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.monthMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.dayMs), 'day');
  }
  if (ms < RELATIVE_TIME_THRESHOLDS.yearMs) {
    return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.monthMs), 'month');
  }
  return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.yearMs), 'year');
}
```

- [ ] **Step 4: Run (PASS, 10/10)**

```bash
pnpm vitest run tests/renderer/relative-time.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/relative-time.ts tests/renderer/relative-time.test.ts
git commit -m "feat(lib): relativeTime util with locale-aware tiers"
```

---

# PHASE B — Renderer sweep

> Each task in this phase replaces a small set of `toLocaleString()`/local `relativeTime` callsites with the shared util. Add `title={iso}` to every relative-time span for hover tooltip.

## Task B1: Dedupe ActivityFeed + CommentThread

**Files:**
- Modify: `src/renderer/features/activity/ActivityFeed.tsx`
- Modify: `src/renderer/features/comments/CommentThread.tsx`

- [ ] **Step 1: ActivityFeed — delete local fn, import shared**

In `src/renderer/features/activity/ActivityFeed.tsx`:
- Delete the local `function relativeTime(iso: string): string { ... }` block (lines 27-37).
- Add at top imports: `import { relativeTime } from '@/lib/relative-time';`.
- Find the callsite (around line 124) and wrap its rendering with a `<span title={row.created_at}>` so the tooltip is preserved:
  ```tsx
  <div className="text-xs text-muted-foreground">
    <span title={row.created_at}>{relativeTime(row.created_at)}</span>
  </div>
  ```

- [ ] **Step 2: CommentThread — delete local fn, import shared**

In `src/renderer/features/comments/CommentThread.tsx`:
- Delete local fn (lines 20-29).
- Add import: `import { relativeTime } from '@/lib/relative-time';`.
- Update callsite (around line 98):
  ```tsx
  <span className="text-muted-foreground" title={c.createdAt}>{relativeTime(c.createdAt)}</span>
  ```

- [ ] **Step 3: Typecheck**

```bash
pnpm build:typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/activity/ActivityFeed.tsx src/renderer/features/comments/CommentThread.tsx
git commit -m "refactor(time): dedupe relativeTime in ActivityFeed + CommentThread"
```

---

## Task B2: ProjectOverviewTab Last Scan

**File:** `src/renderer/routes/projects/ProjectOverviewTab.tsx`

- [ ] **Step 1: Add import + replace cell**

Read the file. Find the `{row('Last Scan', project.lastScannedAt ?? 'Never')}` line. Add at top: `import { relativeTime } from '@/lib/relative-time';`. Replace that row with:

```tsx
{row('Last Scan', project.lastScannedAt
  ? <span title={project.lastScannedAt}>{relativeTime(project.lastScannedAt)}</span>
  : 'Never')}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/projects/ProjectOverviewTab.tsx
git commit -m "ui(overview): relative Last Scan w/ ISO tooltip"
```

---

## Task B3: ProjectTable Last Scan / Last Audit columns

**File:** `src/renderer/features/projects/ProjectTable.tsx`

- [ ] **Step 1: Add import + replace cells**

The current cells use a local `fmtDate(...)`. Add: `import { relativeTime } from '@/lib/relative-time';`. Replace both column `cell` definitions:

```tsx
{ header: 'Last Scan', accessorKey: 'lastScannedAt', cell: ({ row }) => {
    const v = row.original.lastScannedAt;
    return v ? <span title={v}>{relativeTime(v)}</span> : '—';
  } },
{ header: 'Last Audit', accessorKey: 'lastAuditedAt', cell: ({ row }) => {
    const v = row.original.lastAuditedAt;
    return v ? <span title={v}>{relativeTime(v)}</span> : '—';
  } }
```

Sort comparator still uses the underlying ISO `accessorKey` value — sort order unchanged.

- [ ] **Step 2: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/projects/ProjectTable.tsx
git commit -m "ui(table): relative Last Scan / Last Audit cells"
```

---

## Task B4: ProjectAuditsTab "Started X"

**File:** `src/renderer/routes/projects/ProjectAuditsTab.tsx`

- [ ] **Step 1: Add import + replace**

Add: `import { relativeTime } from '@/lib/relative-time';`. Find the line currently rendering `Started {new Date(latest.startedAt).toLocaleString()}` (around line 83) and replace with:

```tsx
<span>Started <span title={latest.startedAt}>{relativeTime(latest.startedAt)}</span></span>
```

Leave the elapsed-seconds calculation (`.toFixed(1)s`) alone — that's a duration, not a timestamp.

- [ ] **Step 2: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/projects/ProjectAuditsTab.tsx
git commit -m "ui(audits): relative \"Started X\" w/ ISO tooltip"
```

---

## Task B5: MemoryRoute + AuditsRoute

**Files:**
- Modify: `src/renderer/routes/MemoryRoute.tsx`
- Modify: `src/renderer/routes/AuditsRoute.tsx`

- [ ] **Step 1: MemoryRoute**

Find the conditional rendering for `p.lastScannedAt` (around line 47). Add `import { relativeTime } from '@/lib/relative-time';`. Wrap the existing display with the relative+title pattern. Read the existing block to determine the exact JSX context; replace any `toLocaleString` / `toLocaleDateString` with `relativeTime(p.lastScannedAt)` wrapped in `<span title={p.lastScannedAt}>`. Leave "never scanned" fallback intact.

- [ ] **Step 2: AuditsRoute**

Find `audited ${new Date(p.lastAuditedAt).toLocaleDateString()}` (around line 84). Add the import. Replace with:

```tsx
audited <span title={p.lastAuditedAt}>{relativeTime(p.lastAuditedAt)}</span>
```

(Keep the surrounding `${p.lastAuditedAt ? ... : 'never audited'}` ternary.)

- [ ] **Step 3: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/routes/MemoryRoute.tsx src/renderer/routes/AuditsRoute.tsx
git commit -m "ui(routes): relative timestamps in MemoryRoute + AuditsRoute"
```

---

## Task B6: TaskCard + TrashView

**Files:**
- Modify: `src/renderer/features/tasks/TaskCard.tsx`
- Modify: `src/renderer/features/tasks/TrashView.tsx`

- [ ] **Step 1: TaskCard**

Add: `import { relativeTime } from '@/lib/relative-time';`. Find the lines:

```tsx
Created {new Date(task.createdAt).toLocaleString()}
{task.completedAt && ` · Completed ${new Date(task.completedAt).toLocaleString()}`}
```

Replace with:

```tsx
Created <span title={task.createdAt}>{relativeTime(task.createdAt)}</span>
{task.completedAt && (
  <> · Completed <span title={task.completedAt}>{relativeTime(task.completedAt)}</span></>
)}
```

- [ ] **Step 2: TrashView**

Add the import. Find:

```tsx
Deleted {t.deletedAt ? new Date(t.deletedAt).toLocaleString() : '—'}
```

Replace with:

```tsx
Deleted {t.deletedAt ? <span title={t.deletedAt}>{relativeTime(t.deletedAt)}</span> : '—'}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/tasks/TaskCard.tsx src/renderer/features/tasks/TrashView.tsx
git commit -m "ui(tasks): relative timestamps in TaskCard + TrashView"
```

---

# PHASE C — Git refresh

## Task C1: `refreshGit` module + tests (TDD)

**Files:**
- Create: `src/main/projects/git-refresh.ts`
- Create: `tests/main/git-refresh.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/main/git-refresh.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refreshGit, type GitRefreshDeps } from '../../src/main/projects/git-refresh';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function makeDeps(opts: {
  hasDir?: boolean;
  results?: Record<string, { status: number; stdout: string; stderr: string }>;
}): GitRefreshDeps {
  const results = opts.results ?? {};
  return {
    hasDir: () => opts.hasDir ?? true,
    spawn: vi.fn(async (cmd: string, args: string[]) => {
      const key = `${cmd} ${args.join(' ')}`;
      for (const k of Object.keys(results)) {
        if (key.startsWith(k)) return results[k]!;
      }
      return { status: 0, stdout: '', stderr: '' };
    })
  };
}

describe('refreshGit', () => {
  it('skips when .git directory is absent', async () => {
    const deps = makeDeps({ hasDir: false });
    const result = await refreshGit('C:\\tmp', logger, deps);
    expect(result.attempted).toBe(false);
    expect(result.fetched).toBe(false);
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it('reports fetched=false on fetch failure (soft-fail)', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 128, stdout: '', stderr: 'fatal: could not read Username for' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.attempted).toBe(true);
    expect(result.fetched).toBe(false);
    expect(result.pulled).toBe(false);
    expect(result.message).toMatch(/could not refresh/i);
  });

  it('reports up-to-date when ahead=0 behind=0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t0\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.fetched).toBe(true);
    expect(result.pulled).toBe(false);
    expect(result.behind).toBe(0);
    expect(result.ahead).toBe(0);
    expect(result.dirty).toBe(false);
    expect(result.message).toMatch(/up to date/i);
  });

  it('pulls when clean and behind > 0 and ahead == 0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t3\n', stderr: '' },
        'git pull --ff-only': { status: 0, stdout: '', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(true);
    expect(result.behind).toBe(3);
    expect(result.message).toMatch(/fast-forwarded 3/i);
  });

  it('skips pull when working tree is dirty even if behind', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: ' M src/foo.ts\n', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t2\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(false);
    expect(result.dirty).toBe(true);
    expect(result.behind).toBe(2);
    expect(result.message).toMatch(/remote ahead by 2.*uncommitted/i);
  });

  it('skips pull and reports diverged when ahead and behind both > 0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '1\t2\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(false);
    expect(result.ahead).toBe(1);
    expect(result.behind).toBe(2);
    expect(result.message).toMatch(/diverged/i);
  });
});
```

- [ ] **Step 2: Run (FAIL — module not found)**

```bash
pnpm test tests/main/git-refresh.test.ts
```

(Use `pnpm test` not bare `vitest` — A1 of phase 7.5 wired the ABI swap into pretest/posttest. This test does NOT touch better-sqlite3 but the pretest hook is harmless.)

- [ ] **Step 3: Implement**

```ts
// src/main/projects/git-refresh.ts
import path from 'node:path';
import type { Logger } from 'pino';

export const GIT_FETCH_TIMEOUT_MS = 30_000;

export interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface SpawnFn {
  (cmd: string, args: string[], opts: {
    cwd: string;
    timeoutMs: number;
    env: Record<string, string>;
  }): Promise<SpawnResult>;
}

export interface GitRefreshDeps {
  spawn: SpawnFn;
  hasDir: (path: string) => boolean;
}

export interface GitRefreshResult {
  attempted: boolean;
  fetched: boolean;
  pulled: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  message: string;
}

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' } as Record<string, string>;

export async function refreshGit(
  rootDir: string,
  logger: Logger,
  deps: GitRefreshDeps
): Promise<GitRefreshResult> {
  if (!deps.hasDir(path.join(rootDir, '.git'))) {
    return { attempted: false, fetched: false, pulled: false, dirty: false, ahead: 0, behind: 0, message: 'not a git repo' };
  }

  const baseOpts = { cwd: rootDir, timeoutMs: GIT_FETCH_TIMEOUT_MS, env: ENV };

  const fetched = await deps.spawn('git', ['fetch', 'origin', '--quiet', '--no-tags'], baseOpts);
  if (fetched.status !== 0) {
    logger.warn({ stderr: fetched.stderr }, 'git fetch failed');
    return { attempted: true, fetched: false, pulled: false, dirty: false, ahead: 0, behind: 0, message: 'Could not refresh remote (continuing)' };
  }

  const status = await deps.spawn('git', ['status', '--porcelain'], baseOpts);
  const dirty = status.status === 0 && status.stdout.trim().length > 0;

  const branchOut = await deps.spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], baseOpts);
  const branch = branchOut.status === 0 ? branchOut.stdout.trim() : 'HEAD';

  let ahead = 0;
  let behind = 0;
  if (branch !== 'HEAD') {
    const counts = await deps.spawn('git', ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`], baseOpts);
    if (counts.status === 0) {
      const parts = counts.stdout.trim().split(/\s+/);
      ahead = Number.parseInt(parts[0] ?? '0', 10) || 0;
      behind = Number.parseInt(parts[1] ?? '0', 10) || 0;
    }
  }

  let pulled = false;
  if (!dirty && behind > 0 && ahead === 0) {
    const pull = await deps.spawn('git', ['pull', '--ff-only', 'origin'], baseOpts);
    pulled = pull.status === 0;
    if (!pulled) logger.warn({ stderr: pull.stderr }, 'git pull --ff-only failed');
  }

  const message = describe({ fetched: true, pulled, dirty, ahead, behind });
  return { attempted: true, fetched: true, pulled, dirty, ahead, behind, message };
}

function describe(r: { fetched: boolean; pulled: boolean; dirty: boolean; ahead: number; behind: number }): string {
  if (r.pulled) return `Fast-forwarded ${r.behind} commit${r.behind === 1 ? '' : 's'}`;
  if (r.dirty && r.behind > 0) return `Remote ahead by ${r.behind} — local has uncommitted changes`;
  if (r.ahead > 0 && r.behind > 0) return `Diverged from origin by ${r.ahead}/${r.behind} (push or rebase)`;
  if (r.behind === 0 && r.ahead === 0) return 'Up to date with remote';
  if (r.ahead > 0 && r.behind === 0) return `Local ahead by ${r.ahead} — push when ready`;
  return 'Remote refresh complete';
}
```

- [ ] **Step 4: Run (PASS, 6/6)**

```bash
pnpm test tests/main/git-refresh.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main/projects/git-refresh.ts tests/main/git-refresh.test.ts
git commit -m "feat(main): refreshGit orchestrator (fetch + ff-only pull, soft-fail)"
```

---

## Task C2: Add `git-refresh` to pipeline stage union

**Files:**
- Modify: `src/shared/pipeline-events.ts`
- Modify: `src/main/pipeline/run.ts`

The `PipelineStage` union is defined in BOTH files (duplicated). Both must mirror the addition.

- [ ] **Step 1: Edit `src/shared/pipeline-events.ts`**

Replace the existing block with:

```ts
export type PipelineStage =
  | 'queued'
  | 'git-refresh'
  | 'scanning'
  | 'memory-generating'
  | 'memory-writing'
  | 'auditing'
  | 'completed'
  | 'failed';

export interface GitRefreshPayload {
  attempted: boolean;
  fetched: boolean;
  pulled: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export interface PipelineEvent {
  projectId: string;
  stage: PipelineStage;
  message?: string;
  errorMessage?: string;
  gitRefresh?: GitRefreshPayload;
}

export interface AutoPipelineOpts {
  generateMemory?: boolean;
  writeMemoryFile?: boolean;
  runAudit?: boolean;
}
```

- [ ] **Step 2: Mirror in `src/main/pipeline/run.ts`**

Find the duplicate `PipelineStage` + `PipelineEvent` block (currently lines 13-27). Replace with:

```ts
export type PipelineStage =
  | 'queued'
  | 'git-refresh'
  | 'scanning'
  | 'memory-generating'
  | 'memory-writing'
  | 'auditing'
  | 'completed'
  | 'failed';

export interface PipelineEvent {
  projectId: string;
  stage: PipelineStage;
  message?: string;
  errorMessage?: string;
  gitRefresh?: import('@shared/pipeline-events').GitRefreshPayload;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm build:typecheck
```

Expected: PASS. `AppShell`'s `STAGE_LABEL[evt.stage]` indexes a Record; the new stage means TypeScript will complain about exhaustiveness ONLY if `STAGE_LABEL` is typed as a complete map. If a type error appears at that line, fix it in C3 (next task).

- [ ] **Step 4: Commit**

```bash
git add src/shared/pipeline-events.ts src/main/pipeline/run.ts
git commit -m "feat(pipeline): add git-refresh stage + GitRefreshPayload"
```

---

## Task C3: Wire `refreshGit` into scanner-handlers + STAGE_LABEL

**Files:**
- Modify: `src/main/ipc/scanner-handlers.ts`
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Add a spawn util adapter (if not already importable)**

We need an async wrapper around `child_process.spawn` that returns `{ status, stdout, stderr }` and supports timeout. Build it inline at the top of `scanner-handlers.ts`:

```ts
import { spawn as nativeSpawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { refreshGit, type SpawnFn } from '@main/projects/git-refresh';
import { IpcChannels as Ch } from '@shared/ipc-channels';

const asyncSpawn: SpawnFn = (cmd, args, opts) =>
  new Promise((resolve) => {
    const child = nativeSpawn(cmd, args, { cwd: opts.cwd, env: opts.env, windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, opts.timeoutMs);
    child.stdout?.on('data', (b) => { stdout += b.toString(); });
    child.stderr?.on('data', (b) => { stderr += b.toString(); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        status: timedOut ? 124 : (typeof code === 'number' ? code : (signal ? 128 : 1)),
        stdout,
        stderr
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ status: 127, stdout: '', stderr: err.message });
    });
  });
```

(Keep all existing imports + the `Result`/`ok`/`fail` helpers as-is. Add the new imports near the top with the others. `Ch` alias is for the pipeline emit.)

- [ ] **Step 2: Wire git-refresh emit + invocation before `runScan`**

In `registerScannerHandlers`, modify the `IpcChannels.scanStart` handler so that AFTER projectId/payload are resolved BUT BEFORE `runScan(...)` is called, the cloud-project git refresh runs.

Replace the body of the `scanStart` handler with:

```ts
ipcMain.handle(IpcChannels.scanStart,
  async (_e, payload: string | { projectId: string; localPath?: string; name?: string }): Promise<Result<Scan>> => {
    try {
      const projectId = typeof payload === 'string' ? payload : payload.projectId;
      if (typeof payload !== 'string' && payload.localPath && payload.name) {
        ctx.projectsService.upsertStub({
          id: payload.projectId,
          name: payload.name,
          localPath: payload.localPath
        });
      }

      // Phase 11: git-refresh for cloud projects with a local checkout.
      const project = ctx.projectsService.byId(projectId);
      const win = ctx.getMainWindow();
      if (project && project.source === 'cloud' && project.localPath) {
        win?.webContents.send(Ch.pipelineProgress, {
          projectId,
          stage: 'git-refresh',
          message: 'Refreshing remote refs…'
        });
        const result = await refreshGit(project.localPath, ctx.logger, {
          spawn: asyncSpawn,
          hasDir: (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
        });
        win?.webContents.send(Ch.pipelineProgress, {
          projectId,
          stage: 'git-refresh',
          message: result.message,
          gitRefresh: result
        });
      }

      const controller = new AbortController();
      const emitter = new ProgressEmitter('', projectId, ctx.getMainWindow);
      const { scan } = await runScan(
        { scansRepo: ctx.scansRepo, projectsService: ctx.projectsService, logger: ctx.logger },
        { projectId, emitter, signal: controller.signal }
      );
      activeAborts.delete(scan.id);
      return ok(scan);
    } catch (e) { return fail(e); }
  }
);
```

(Verify `ctx.projectsService.byId(projectId)` exists. If the method is named differently — e.g., `get` or `find` — read `src/main/projects/service.ts` and adjust.)

- [ ] **Step 3: AppShell STAGE_LABEL**

In `src/renderer/components/layout/AppShell.tsx`, find the `STAGE_LABEL` map (search for `STAGE_LABEL`). Add an entry: `'git-refresh': 'Remote refresh'`. The full map should now include all eight stages.

- [ ] **Step 4: Typecheck**

```bash
pnpm build:typecheck
```

- [ ] **Step 5: Full test suite**

```bash
pnpm test
```

Expected: green. Total = previous 181 + 10 (A1) + 6 (C1) = 197 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/scanner-handlers.ts src/renderer/components/layout/AppShell.tsx
git commit -m "feat(scan): invoke refreshGit before runScan for cloud projects"
```

---

# PHASE D — Acceptance + PR

## Task D1: Auto quality gate

**Files:** none modified.

- [ ] **Step 1: Build verification**

```bash
pnpm build:typecheck
pnpm build
```

Both green.

- [ ] **Step 2: Spec status flip + commit on branch**

```bash
sed -i 's|^\*\*Status:\*\* Approved (brainstorm)$|**Status:** Shipped|' docs/superpowers/specs/2026-05-11-phase-11-git-refresh-relative-timestamps-design.md
git add docs/superpowers/specs/2026-05-11-phase-11-git-refresh-relative-timestamps-design.md
git commit -m "docs: mark phase-11 spec shipped"
```

Do this BEFORE PR opens to avoid stale-HEAD merge state.

- [ ] **Step 3: Controller-driven PR flow**

Subagent reports DONE. Controller:
1. `git push -u origin refs/heads/phase-11-git-refresh:refs/heads/phase-11-git-refresh` (explicit refspec to avoid tag collisions).
2. Open PR via REST API.
3. Poll workflow `274667828` for the PR HEAD until completed.
4. If green, merge via PUT.
5. Pull main, tag `phase-11-git-refresh`, push tag with explicit refspec `refs/tags/phase-11-git-refresh`.
6. Delete remote + local branch.

---

# Self-Review Notes

**Spec coverage:**
- [x] Spec A.1 `relativeTime` util — A1.
- [x] Spec A.2 Replace duplicates — B1.
- [x] Spec A.3 Sweep callsites — B2 / B3 / B4 / B5 / B6.
- [x] Spec A.4 `title={iso}` tooltip — included in every sweep task (B1-B6).
- [x] Spec B.1 `refreshGit` module — C1.
- [x] Spec B.2 Pre-scan hook — C3.
- [x] Spec B.3 New `git-refresh` stage — C2.
- [x] STAGE_LABEL — C3.
- [x] Locale-aware Intl.RelativeTimeFormat — A1.
- [x] Configurable timeout via exported constant `GIT_FETCH_TIMEOUT_MS` — C1.
- [x] Soft-fail throughout — C1 (test coverage).

**Placeholder scan:** No "TBD", no "appropriate error handling", no "similar to Task N", every code step has full code.

**Type consistency:**
- `SpawnFn`, `GitRefreshDeps`, `GitRefreshResult` defined in C1 and consumed in C3 via the exported `SpawnFn` type.
- `PipelineStage` union changes in BOTH `src/shared/pipeline-events.ts` AND `src/main/pipeline/run.ts` (the codebase duplicates the definition; C2 handles both).
- `GitRefreshPayload` defined in `src/shared/pipeline-events.ts` and re-used via `import('@shared/pipeline-events').GitRefreshPayload` in `src/main/pipeline/run.ts`.

**Risks:**
- B5 instructs to "read the existing block to determine the exact JSX context" — this is a minor judgement call but the file is small (~50 lines) so the implementer can hold it in context.
- C3's adapter relies on Node `child_process` signatures stable across Node 20/22 — both supported.
- Exhaustiveness lint on `STAGE_LABEL`: if the map is typed `Record<PipelineStage, string>`, typecheck will catch missing entries in C2. C3 closes that.
- Spec test regex `/^2 minutes ago$/` assumes English locale and `numeric: 'always'`. If Intl returns "2 minute ago" (no plural) on a future engine, tests will need to relax to `/^2 minutes? ago$/`. Acceptable v1.

**Out of plan (per spec):**
- GitHub REST API path (phase 12).
- Settings UI for fetch timeout.
- Rich UI affordance for "click to pull" (toast surfaces state only).
- Tooltip beyond native `title` attribute.
- Locales other than English.
