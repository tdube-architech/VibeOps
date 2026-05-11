# Phase 11 — Git Refresh + Relative Timestamps Design

**Date:** 2026-05-11
**Status:** Shipped
**Scope:** Two coupled improvements driven by phase-10 testing feedback. (1) App-wide human-friendly relative timestamps with absolute-time tooltip. (2) On auto-scan for cloud-synced projects with local checkouts: `git fetch` + safe `pull --ff-only` when working tree is clean; otherwise fetch only and surface remote-ahead state to the UI.

## Goals

- Fix the UX where ISO timestamps like `2026-05-11T15:13:49.93+00:00` are shown to users.
- Fix the bug where a freshly pushed remote commit doesn't appear in the project until the user manually runs `git pull`.
- Stay within local-git boundaries; collaborator-without-checkout case is phase 12.

## Behaviour summary

### A. Timestamps

- Replace every renderer "time since" output with `relativeTime(iso)` from a single shared util.
- Output tiers: `just now` (<60s) / `Nm ago` (<60m) / `Nh ago` (<24h) / `Nd ago` (<30d) / `Nmo ago` (<12mo) / `Ny ago` (≥12mo).
- Locale-aware: use `Intl.RelativeTimeFormat` (native; no dep) for unit names; fall back to "ago" suffix.
- Add `title={iso}` to every relative-time span. Hover → native browser tooltip with the exact ISO timestamp.
- Tables (`ProjectTable`) get relative cells. Sort still uses underlying ISO field.

### B. Git refresh on cloud auto-scan

- New pipeline stage `git-refresh` runs BEFORE `runScan` when `project.source === 'cloud'` AND `project.localPath` exists AND `<localPath>/.git` directory exists.
- Steps inside `git-refresh`:
  1. `git fetch origin --quiet --no-tags` (30 s default timeout, configurable via exported constant).
  2. Check working tree state via `git status --porcelain` — empty output = clean.
  3. Check ahead/behind: `git rev-list --left-right --count HEAD...origin/<currentBranch>`.
  4. If working tree clean AND behind > 0 AND ahead == 0 (or ahead == 0 by virtue of clean+behind only): `git pull --ff-only origin`. Soft-fail on any error.
  5. If working tree dirty OR ahead > 0: skip pull. Surface state to UI via the pipeline event payload (`behindCount`, `ahead`, `dirty`).
- All commands run with `GIT_TERMINAL_PROMPT=0` to suppress credential prompts; auth failure → soft-fail with a friendly log message.
- Fetch/pull failure NEVER stops the scan. Pipeline emits a `git-refresh` info event with the result; the existing `failed` stage is reserved for true scan failures.

## Components

### A. Timestamps

| File | Action | Purpose |
|---|---|---|
| `src/renderer/lib/relative-time.ts` | create | exports `relativeTime(iso)` and `RELATIVE_TIME_THRESHOLDS` constant |
| `tests/renderer/relative-time.test.ts` | create | tier boundaries, null/undefined, future, locale fallback |
| `src/renderer/features/activity/ActivityFeed.tsx` | modify | import shared, delete local fn, add `title={iso}` |
| `src/renderer/features/comments/CommentThread.tsx` | modify | same |
| `src/renderer/routes/projects/ProjectOverviewTab.tsx` | modify | "Last Scan" row: `relativeTime + title` |
| `src/renderer/features/projects/ProjectTable.tsx` | modify | Last Scan, Last Audit columns: relative cells |
| `src/renderer/routes/projects/ProjectAuditsTab.tsx` | modify | "Started X" → relative |
| `src/renderer/routes/MemoryRoute.tsx` | modify | lastScannedAt → relative |
| `src/renderer/routes/AuditsRoute.tsx` | modify | `audited X` → relative |
| `src/renderer/features/tasks/TaskCard.tsx` | modify | Created / Completed → relative |
| `src/renderer/features/tasks/TrashView.tsx` | modify | Deleted → relative |

`relativeTime` implementation:
```ts
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
export const RELATIVE_TIME_THRESHOLDS = {
  justNowMs: 60_000,
  minuteMs: 60_000,
  hourMs: 60 * 60_000,
  dayMs: 24 * 60 * 60_000,
  monthMs: 30 * 24 * 60 * 60_000,
  yearMs: 365 * 24 * 60 * 60_000
};

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const ms = Date.now() - t;
  if (ms < RELATIVE_TIME_THRESHOLDS.justNowMs) return 'just now';
  if (ms < RELATIVE_TIME_THRESHOLDS.hourMs) return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.minuteMs), 'minute');
  if (ms < RELATIVE_TIME_THRESHOLDS.dayMs) return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.hourMs), 'hour');
  if (ms < RELATIVE_TIME_THRESHOLDS.monthMs) return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.dayMs), 'day');
  if (ms < RELATIVE_TIME_THRESHOLDS.yearMs) return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.monthMs), 'month');
  return RTF.format(-Math.floor(ms / RELATIVE_TIME_THRESHOLDS.yearMs), 'year');
}
```

### B. Git refresh

| File | Action | Purpose |
|---|---|---|
| `src/main/projects/git-refresh.ts` | create | `refreshGit(rootDir, logger, deps)` orchestrator |
| `tests/main/git-refresh.test.ts` | create | spawn-injected tests covering all branches |
| `src/main/pipeline/run.ts` | modify | invoke `refreshGit` before `runScan` for cloud projects with `.git` |
| `src/shared/pipeline-events.ts` | modify | add `'git-refresh'` to `PipelineEvent.stage` union; add optional `gitRefresh` payload field |
| `src/renderer/components/layout/AppShell.tsx` | modify | `STAGE_LABEL['git-refresh']` = 'Refreshing remote refs' |

`refreshGit` shape:
```ts
export const GIT_FETCH_TIMEOUT_MS = 30_000;

export interface GitRefreshResult {
  attempted: boolean;
  fetched: boolean;
  pulled: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  message: string;
}

export interface GitRefreshDeps {
  spawn: (cmd: string, args: string[], opts: { cwd: string; timeoutMs: number; env: Record<string, string> }) => Promise<{ status: number; stdout: string; stderr: string }>;
  hasDir: (path: string) => boolean;
}

export async function refreshGit(rootDir: string, logger: Logger, deps: GitRefreshDeps): Promise<GitRefreshResult>;
```

Logic:
1. `attempted = hasDir(rootDir + '/.git')`. If false → `{ attempted: false, fetched: false, pulled: false, dirty: false, ahead: 0, behind: 0, message: 'not a git repo' }`.
2. `spawn('git', ['fetch', 'origin', '--quiet', '--no-tags'], { cwd, timeoutMs: GIT_FETCH_TIMEOUT_MS, env: { ..., GIT_TERMINAL_PROMPT: '0' } })`. Non-zero exit → `{ attempted: true, fetched: false, ..., message: stderr }`. Soft-fail, do not throw.
3. `spawn('git', ['status', '--porcelain'])`. Output empty? `dirty = false`. Otherwise `dirty = true`.
4. Determine current branch: `spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'])` → trim stdout.
5. Determine ahead/behind: `spawn('git', ['rev-list', '--left-right', '--count', \`HEAD...origin/${branch}\`])` → output `"<ahead>\t<behind>"`. Parse. Non-zero → `ahead = behind = 0`.
6. If `!dirty && behind > 0 && ahead === 0`: `spawn('git', ['pull', '--ff-only', 'origin'])`. Set `pulled = (status === 0)`.
7. Return aggregate.

Pipeline wiring in `src/main/pipeline/run.ts`:
- Right before `runScan` is invoked:
  - if `project.source === 'cloud'` AND `project.localPath`:
    - `emit({ projectId, stage: 'git-refresh', message: 'Refreshing remote refs…' })`.
    - `const result = await refreshGit(project.localPath, logger, deps);`
    - Build a friendly message:
      - `result.pulled` → `Fast-forwarded N commits`.
      - `!result.fetched` → `Could not refresh remote (continuing)`.
      - `result.dirty && result.behind > 0` → `Remote ahead by N — local has uncommitted changes`.
      - `result.ahead > 0 && result.behind > 0` → `Diverged from origin by N/N (push or rebase)`.
      - `result.behind === 0` → `Up to date with remote`.
    - `emit({ projectId, stage: 'git-refresh', message, payload: { gitRefresh: result } })`.

UI (toast on `git-refresh` stage):
- `AppShell` STAGE_LABEL = `'Remote refresh'`. The existing toast.info path renders `message` already.

## Data flow

```
Auto-scan trigger (phase 10) → pipeline.run({ projectId, source: 'cloud' })
  ↓
if cloud AND localPath AND .git exists:
   emit git-refresh stage 'Refreshing remote refs…'
   refreshGit(localPath)
     - fetch (soft-fail)
     - status --porcelain (dirty?)
     - rev-parse HEAD branch
     - rev-list ahead/behind
     - if clean+behind+!ahead: pull --ff-only
   emit git-refresh result message
  ↓
runScan (existing stages)
```

## Edge cases

- **No `origin` remote configured:** fetch fails → soft-fail, message logged. Scan still runs.
- **Detached HEAD:** `rev-parse --abbrev-ref HEAD` returns "HEAD" → branch lookup fails → ahead/behind both 0. No pull attempted. Acceptable.
- **HTTPS remote, no cached cred:** `GIT_TERMINAL_PROMPT=0` causes fetch to fail without hanging. Soft-fail. User sees "Could not refresh remote (continuing)".
- **SSH remote with ssh-agent loaded:** silent success.
- **Pull conflict (somehow despite ff-only check):** ff-only refuses to merge; logs message. No tree mutation.
- **Working tree dirty + behind:** fetch updates refs; no pull. UI shows "Remote ahead by N — local has uncommitted changes". User decides.
- **Future ISO timestamp** (clock skew): `relativeTime` returns "just now".
- **Invalid ISO**: `relativeTime` returns "—" (no `NaN ago`).
- **Null/undefined ISO**: returns "—".
- **Very large negative locale unit** (e.g., 700-day-old): `Intl.RelativeTimeFormat` handles "2 years ago" cleanly.

## Out of scope (phase 12 + later)

- GitHub REST API path for collaborators without a local checkout (phase 12).
- Auto-pull when dirty or diverged (requires interactive resolution; not safe).
- Configurable fetch timeout via Settings UI (constant export is sufficient; settings later if user requests).
- Tooltip beyond native `title` attribute (no Radix Tooltip wrapper).
- Polished UI for "Remote ahead by N — click to pull" affordance (the toast surfaces the state; richer UI can come later).

## Risk

- Git invocations spawn a child process per scan. Combined latency: ~500 ms - 5 s typical, longer on cold caches or large repos. Acceptable for an explicit refresh, but worth monitoring.
- `Intl.RelativeTimeFormat` returns slightly different strings across Chromium versions ("2 minutes ago" vs "2 min. ago" depending on locale config). Tests should accept the regex `/^\d+\s+(minutes?|hours?|days?|months?|years?)\s+ago$/` rather than asserting exact strings, with the explicit fallbacks for `<60s` and null cases.
- `--ff-only` pull is safe but the upstream branch can still race (very narrow window). If pull races and fails, soft-fail; the user re-opens and we try again.

## Acceptance

1. `pnpm test` green (existing 181 + new ~12 = ~193).
2. `pnpm build:typecheck` + `pnpm build` green.
3. Manual A: open any project — every "time ago" display reads `just now`/`Nm ago`/`Nh ago`/etc. Hover any of them → tooltip shows ISO timestamp.
4. Manual B (cloud project, local checkout, behind remote, clean tree): open project → toast "Refreshing remote refs…" then "Fast-forwarded N commits" → git tab reflects the new commit without manual pull.
5. Manual B (cloud project, dirty tree, behind remote): open project → toast "Remote ahead by N — local has uncommitted changes" → no pull happens.
6. Manual B (local-only project): no git-refresh toast (skipped).
