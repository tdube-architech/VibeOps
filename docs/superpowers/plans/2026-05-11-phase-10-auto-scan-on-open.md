# Phase 10 — Auto-scan on Project Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trigger a scan + git refresh automatically when the user enters a project's detail route, subject to a 5-minute cooldown, reusing existing pipeline toasts for feedback.

**Architecture:** Pure decision function (`decideAutoScan`) + thin React hook (`useAutoScan`) consuming `useStartScan` mutation and TanStack `queryClient.invalidateQueries`. One-line call site in `ProjectDetailRoute`.

**Tech Stack:** React, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-10-auto-scan-on-open-design.md`

---

## File Structure

**Create:**
- `src/renderer/features/projects/autoScanPolicy.ts` — pure `decideAutoScan(...)` + `AUTO_SCAN_COOLDOWN_MS`.
- `src/renderer/features/projects/useAutoScan.ts` — React hook wiring policy + mutation + invalidation.
- `tests/renderer/auto-scan-policy.test.ts` — covers the decision matrix (no React render).

**Modify:**
- `src/renderer/routes/projects/ProjectDetailRoute.tsx` — call `useAutoScan(project)`.

**Untouched:**
- Pipeline / scan IPC.
- AppShell pipeline toast listener (already wired).
- `useStartScan` mutation.

---

# PHASE A — Policy fn (TDD)

## Task A1: `decideAutoScan` pure function

**Files:**
- Create: `src/renderer/features/projects/autoScanPolicy.ts`
- Create: `tests/renderer/auto-scan-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/renderer/auto-scan-policy.test.ts
import { describe, it, expect } from 'vitest';
import {
  AUTO_SCAN_COOLDOWN_MS,
  decideAutoScan
} from '../../src/renderer/features/projects/autoScanPolicy';

const PROJ = { id: 'p1', localPath: 'C:\\code\\demo', source: 'local' as const };
const NOW = Date.parse('2026-05-11T12:00:00Z');

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

describe('decideAutoScan', () => {
  it('triggers when project never scanned', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: null },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('trigger');
    expect(out.reason).toMatch(/never scanned/i);
  });

  it('skips when scanned within cooldown', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: iso(-30_000) },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/cooldown/i);
  });

  it('triggers when older than cooldown', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: iso(-(AUTO_SCAN_COOLDOWN_MS + 1000)) },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('trigger');
    expect(out.reason).toMatch(/stale/i);
  });

  it('skips when same project already attempted in this mount', () => {
    const out = decideAutoScan({
      project: { ...PROJ, lastScannedAt: null },
      lastAttemptedId: 'p1',
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/already attempted/i);
  });

  it('triggers after project.id change resets attempt ref', () => {
    const out = decideAutoScan({
      project: { id: 'p2', localPath: 'C:\\code\\two', source: 'local', lastScannedAt: null },
      lastAttemptedId: 'p1',
      now: NOW
    });
    expect(out.action).toBe('trigger');
  });

  it('skips when cloud project has no localPath (read-only collaborator view)', () => {
    const out = decideAutoScan({
      project: { id: 'p3', localPath: '', source: 'cloud', lastScannedAt: null },
      lastAttemptedId: null,
      now: NOW
    });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/no local path/i);
  });

  it('skips when project undefined', () => {
    const out = decideAutoScan({ project: undefined, lastAttemptedId: null, now: NOW });
    expect(out.action).toBe('skip');
    expect(out.reason).toMatch(/no project/i);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
pnpm vitest run tests/renderer/auto-scan-policy.test.ts
```

Expected: FAIL — `Cannot find module '../../src/renderer/features/projects/autoScanPolicy'`.

- [ ] **Step 3: Implement**

```ts
// src/renderer/features/projects/autoScanPolicy.ts
export const AUTO_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

export interface AutoScanInput {
  project: {
    id: string;
    localPath: string;
    source?: 'cloud' | 'local';
    lastScannedAt?: string | null;
  } | undefined;
  lastAttemptedId: string | null;
  now: number;
}

export interface AutoScanDecision {
  action: 'trigger' | 'skip';
  reason: string;
}

export function decideAutoScan(input: AutoScanInput): AutoScanDecision {
  const { project, lastAttemptedId, now } = input;

  if (!project) return { action: 'skip', reason: 'no project' };
  if (!project.localPath) return { action: 'skip', reason: 'no local path (cloud-only view)' };
  if (lastAttemptedId === project.id) {
    return { action: 'skip', reason: 'already attempted this mount' };
  }

  const last = project.lastScannedAt ? new Date(project.lastScannedAt).getTime() : null;
  if (last === null) return { action: 'trigger', reason: 'never scanned' };

  const ageMs = now - last;
  if (ageMs <= AUTO_SCAN_COOLDOWN_MS) {
    return { action: 'skip', reason: `within cooldown (${Math.round(ageMs / 1000)}s ago)` };
  }
  return { action: 'trigger', reason: `stale (${Math.round(ageMs / 1000)}s ago)` };
}
```

- [ ] **Step 4: Run test (PASS, 7/7)**

```bash
pnpm vitest run tests/renderer/auto-scan-policy.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/projects/autoScanPolicy.ts tests/renderer/auto-scan-policy.test.ts
git commit -m "feat(projects): decideAutoScan policy fn with 5-min cooldown"
```

---

# PHASE B — Hook + wire

## Task B1: `useAutoScan` hook

**Files:**
- Create: `src/renderer/features/projects/useAutoScan.ts`

- [ ] **Step 1: Implement**

```ts
// src/renderer/features/projects/useAutoScan.ts
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@shared/types';
import { useStartScan } from './useScans';
import { decideAutoScan } from './autoScanPolicy';

const IN_FLIGHT_RE = /already running|in.?flight|in progress/i;

export function useAutoScan(project: Project | undefined): void {
  const qc = useQueryClient();
  const startScan = useStartScan();
  const lastAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const decision = decideAutoScan({
      project,
      lastAttemptedId: lastAttemptedRef.current,
      now: Date.now()
    });
    if (decision.action !== 'trigger') return;
    if (!project) return;

    lastAttemptedRef.current = project.id;
    qc.invalidateQueries({ queryKey: ['git-info', project.id] });

    startScan.mutate(
      {
        id: project.id,
        localPath: project.localPath,
        name: project.name,
        workspaceId: project.workspaceId
      },
      {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (IN_FLIGHT_RE.test(msg)) return;
          console.warn('[auto-scan] failed', msg);
        }
      }
    );
  }, [project, qc, startScan]);
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm build:typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/projects/useAutoScan.ts
git commit -m "feat(projects): useAutoScan hook (cooldown-gated startScan + git invalidate)"
```

---

## Task B2: Wire into `ProjectDetailRoute`

**Files:**
- Modify: `src/renderer/routes/projects/ProjectDetailRoute.tsx`

- [ ] **Step 1: Import + call**

In `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectDetailRoute.tsx`:

1. Near the other `@/features/projects/...` imports, add:
   ```ts
   import { useAutoScan } from '@/features/projects/useAutoScan';
   ```

2. Inside `ProjectDetailRoute()`, after `useProjectRealtime(id);` (currently line 27), add:
   ```ts
   useAutoScan(project);
   ```

Final order of those lines should be:
```ts
const { data: project, isLoading } = useProject(id);
useProjectRealtime(id);
useAutoScan(project);
const isCloud = project?.source !== 'local' && Boolean(project?.localPath);
```

The hook handles the `project === undefined` case internally (skips with reason "no project"); no conditional call needed.

- [ ] **Step 2: Typecheck**

```bash
pnpm build:typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

```bash
pnpm test
```

Expected: green, total = previous 174 + 7 (A1) = 181 tests.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/routes/projects/ProjectDetailRoute.tsx
git commit -m "feat(projects): call useAutoScan on detail route mount"
```

---

# PHASE C — Acceptance

## Task C1: Auto quality gate + branch flow + tag

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-phase-10-auto-scan-on-open-design.md` (status line only)

- [ ] **Step 1: Build verification**

```bash
pnpm build:typecheck
pnpm build
```

Both green.

- [ ] **Step 2: Push branch + open PR + wait CI + merge**

Branch name: `phase-10-auto-scan` (avoid `phase-10` collision with future tag).

This step is **controller-driven** — the implementer subagent should STOP at "ready for PR" and report DONE. The controller will:

1. `git push -u origin phase-10-auto-scan` (explicit refspec if needed).
2. Open PR via `gh pr create` or REST API.
3. Poll the workflow `274667828` (Test) run for the PR HEAD until completed.
4. If green, merge via PUT `/repos/.../pulls/N/merge`.
5. Delete remote + local branch.

(Subagent does NOT run these.)

- [ ] **Step 3: Flip spec status + commit on branch BEFORE PR open**

```bash
sed -i 's|^\*\*Status:\*\* Approved (brainstorm)$|**Status:** Shipped|' docs/superpowers/specs/2026-05-11-phase-10-auto-scan-on-open-design.md
git add docs/superpowers/specs/2026-05-11-phase-10-auto-scan-on-open-design.md
git commit -m "docs: mark phase-10 spec shipped"
```

Doing this BEFORE the PR open avoids the phase-9 footgun (where pushing a commit after CI created a stale-HEAD merge state).

- [ ] **Step 4: Tag main after merge**

```bash
git checkout main
git pull origin main
git tag -a phase-10-auto-scan -m "Phase 10: auto-scan on project open with 5-min cooldown"
git push origin refs/tags/phase-10-auto-scan
```

(Explicit refspec to avoid the tag-vs-branch collision footgun from phase 9.)

---

# Self-Review Notes

**Spec coverage:**
- [x] Trigger on `ProjectDetailRoute` mount — B2 (`useAutoScan(project)` call).
- [x] 5-min cooldown — A1 (`AUTO_SCAN_COOLDOWN_MS`) + decision branch.
- [x] Git status + scan in parallel — B1 (`invalidateQueries(['git-info', ...])` + `startScan.mutate`).
- [x] In-flight collision silently swallowed — B1 (`IN_FLIGHT_RE` regex in `onError`).
- [x] No new UI; reuses existing pipeline toasts — no UI work in this plan.
- [x] Manual "Run scan" unaffected — `useStartScan` is the same mutation used by the existing button; no code path change.
- [x] Cloud-only project (no localPath) → skip — A1 case + B1 inherits via decision.
- [x] `lastAttemptedRef` prevents duplicate within mount — B1 ref + A1 decision.
- [x] Tests: never-scanned, within cooldown, stale, same-id repeat, project-change reset, no-localPath, undefined — A1.

**Placeholder scan:** zero TBDs / "appropriate error handling" / placeholders.

**Type consistency:**
- `decideAutoScan` signature: input `{ project, lastAttemptedId, now }` → `{ action, reason }`. Consistent A1 test + impl + B1 caller.
- `AutoScanInput.project` shape uses `lastScannedAt?: string | null` to accept the actual `Project` type's `lastScannedAt: string | null` field (matches `src/shared/types.ts:21`).
- `useStartScan` mutation input shape `{ id, localPath, name, workspaceId? }` matches existing signature in `src/renderer/features/projects/useScans.ts:70`.

**Risks (carried from spec):**
- Possible duplicate scans if `useStartScan` has no in-flight protection. Mitigation: B1 swallows `IN_FLIGHT_RE` errors. If duplicates occur, follow up with explicit `useInFlightScan` hook.
- Cooldown loop hazard if `lastScannedAt` never updates after a successful scan. Mitigation: `lastAttemptedRef` gates per-mount. Documented as low-risk and recoverable.

**Out of plan (deferred):**
- Auto-run audit on open.
- Settings UI for cooldown duration.
- Session-scoped attempted-set (only add if user reports repeat-trigger symptoms).
- Visual distinction between auto vs manual scan in toasts.
