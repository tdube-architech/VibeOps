# Phase 10-prelude — Auto-scan on Project Open Design

**Date:** 2026-05-11
**Status:** Shipped
**Scope:** Auto-trigger project scan + git status refresh when the user opens a project's detail route, subject to a 5-minute cooldown. Reuse the existing pipeline progress toasts for feedback.

> **Phase naming note:** This is a small UX prelude inserted before the originally-planned phase 10 (handoff doc export). It's tagged-but-small so order-B remains roughly intact: this becomes phase 10, with handoff/A/E/F+D/G shifting by one.

## Goal

When the user navigates into a project, ensure the displayed state reflects the project's current on-disk reality without requiring a manual "Run scan" click — unless a recent scan already covers it.

## Behaviour summary

- **Trigger:** mount of `ProjectDetailRoute`, or `project.id` change.
- **Cooldown:** skip when `project.lastScannedAt` is within the last 5 minutes.
- **Operations:** invalidate git-info query (forces refetch) + start scan mutation (drives pipeline events). Run in parallel.
- **In-flight collision:** if a scan is already running for this project, the existing scan-start path should error (or be a no-op); auto-scan silently swallows that specific error.
- **Feedback:** none new. Existing per-stage pipeline toasts from `AppShell` already handle "Scanning files…", "Detecting stack…", "Completed", "Failed".
- **Manual override:** unchanged. The existing "Run scan" button bypasses cooldown by calling `startScan` directly.

## Components

### 1. `src/renderer/features/projects/useAutoScan.ts` — new hook

Shape:

```ts
export const AUTO_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

export function useAutoScan(project: Project | undefined): void;
```

Behaviour:

- Captures the current `project.id` and `project.lastScannedAt`.
- A `useRef<string | null>` records the last project id we already attempted to auto-scan in this mount. Resets on project change.
- On `useEffect([project?.id, project?.lastScannedAt])`:
  - Bail when `project` is undefined.
  - Bail when `project.id === lastAttemptedRef.current` (prevent re-triggering within same project).
  - Compute `stale = lastScannedAt === null || Date.now() - new Date(lastScannedAt).getTime() > AUTO_SCAN_COOLDOWN_MS`.
  - When stale:
    - `qc.invalidateQueries({ queryKey: ['git-info', project.id] })` — git refetches automatically (existing `useQuery` in `ProjectOverviewTab` honors invalidation).
    - `lastAttemptedRef.current = project.id`.
    - Call `startScanMutate(project)`. Wrap in `try { ... } catch (e) { ... }`. Suppress errors matching `/already running|in.?flight/i`; surface anything else via `console.warn` (no toast — pipeline already handles failure cases).

### 2. `src/renderer/routes/projects/ProjectDetailRoute.tsx` — call site

After `project` is resolved (existing data fetch), add one line:

```tsx
useAutoScan(project);
```

### 3. Tests

`tests/renderer/use-auto-scan.test.ts` (pure logic via injected deps):

- `null lastScannedAt + no in-flight → triggers scan + invalidates git-info`
- `lastScannedAt 30s ago → skips`
- `lastScannedAt 6 min ago → triggers`
- `same project.id seen twice with same lastScannedAt → only one trigger`
- `project.id change → resets ref + triggers when stale`
- `startScan throws "Already running" → swallowed, no console.warn`
- `startScan throws other error → console.warn invoked, no toast`

Tests use injected `qc`, `mutate`, `console.warn` fakes — no React render needed (extract policy fn `decideAutoScan(project, lastAttemptedId, now)` for unit testability; hook wires it to React).

## Data flow

```
ProjectDetailRoute mounts → useAutoScan(project)
  ↓
useEffect: decideAutoScan(project, lastAttemptedRef, now)
  → { action: 'trigger' | 'skip', reason }
  ↓
if 'trigger':
   qc.invalidateQueries(['git-info', project.id])    // UI git status refetches
   startScan.mutate(project)                          // pipeline events emit
   lastAttemptedRef = project.id
  ↓
Existing AppShell pipeline listener emits toasts for each stage.
```

## Edge cases

- **New project (`lastScannedAt === null`)** → triggers immediately.
- **User navigates Overview → Tasks → Overview within 1 min** → ProjectDetailRoute may remount; ref guards against re-trigger for same `project.id` until `lastScannedAt` changes. After the auto-scan completes, `lastScannedAt` updates, ref does not re-fire because cooldown now holds.
- **User switches between two projects A → B → A within cooldown** → second visit to A skips (cooldown). Acceptable.
- **Scan fails** → pipeline emits `failed` toast. `lastScannedAt` does not advance → next mount > 5 min later auto-retries.
- **Cloud project read by collaborator (read-only path)** → `startScan` for cloud projects without a local path either errors or no-ops in existing code; auto-scan should NOT trigger when `project.source === 'cloud'` and there is no local path. Decision: bail when `!project.localPath`. Documented as additional bail in §1.
- **Component unmounts mid-scan** → scan continues server-side. AppShell pipeline listener catches the completion toast regardless of which route is mounted.

## Out of scope

- Auto-run audit (separate decision; possible follow-up).
- Configurable cooldown via Settings UI.
- Visual indicator distinguishing auto vs manual scan in toast text.
- Auto-scan trigger on file-system events outside the app (e.g., user `git pull` from terminal). Phase V2 watcher work.

## Risk

- If `startScan` lacks in-flight protection and is invoked while a scan is already running, the system may attempt to insert duplicate scan rows. Inspect `src/main/scanner/...` before implementation; if collision is possible, add a pre-check in `useAutoScan` via a future `useInFlightScan` hook (out of scope here — assume server-side rejection is sufficient).
- A subtle infinite-loop hazard: if `lastScannedAt` never updates (e.g., scan completes without writing it for any reason), the cooldown never starts and every mount re-triggers. `lastAttemptedRef` mitigates by gating on `project.id`, but if the user navigates away and back, ref resets. Mitigation: add a session-scoped `Set<projectId>` of "attempted at least once this session" alongside the ref; second mount within session does not re-trigger even if `lastScannedAt` still null. Implementation decision: ship without session-set first; add if user reports repeat-trigger symptoms.

## Acceptance

1. `pnpm test` green (existing + new auto-scan tests).
2. `pnpm build:typecheck` + `pnpm build` green.
3. Manual: open a project with `lastScannedAt > 5 min ago` → toasts fire automatically; tasks/findings refresh after completion.
4. Manual: navigate back to same project within 1 min → no toasts (cooldown holds).
5. Manual: open a fresh project (never scanned) → toasts fire.
6. Manual: trigger manual "Run scan" within cooldown → still works (bypasses auto path).
