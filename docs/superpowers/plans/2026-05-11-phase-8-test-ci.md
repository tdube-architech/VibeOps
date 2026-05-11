# Phase 8 — CI Test Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that runs `pnpm test && pnpm build:typecheck && pnpm build` on every PR and every push to `main`.

**Architecture:** Single new file `.github/workflows/test.yml`. Stub `.env` written inline. Reuses existing pnpm 10 + Node 20 + windows-latest setup pattern from `release.yml`. The post-install ABI-swap chain from phase 7.5 handles native bindings automatically.

**Tech Stack:** GitHub Actions, pnpm 10, Node 20, vitest, electron-vite, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-05-11-phase-8-test-ci-design.md`

---

## File Structure

**Create:**
- `.github/workflows/test.yml` — the workflow

**Untouched:**
- `.github/workflows/release.yml` — release pipeline unchanged
- `package.json` — already has `test`, `build:typecheck`, `build` scripts
- `scripts/rebuild-sqlite.mjs` — phase-7.5 ABI swap is what makes this work

No source code changes. No test changes.

---

# PHASE A — Workflow file

## Task A1: Create `.github/workflows/test.yml`

**Files:**
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Write the workflow file**

Content:

```yaml
name: Test

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Write stub .env
        shell: bash
        run: |
          cat > .env <<'EOF'
          MAIN_VITE_SUPABASE_URL=https://stub.supabase.co
          MAIN_VITE_SUPABASE_ANON_KEY=stub-anon-key
          RENDERER_VITE_SUPABASE_URL=https://stub.supabase.co
          RENDERER_VITE_SUPABASE_ANON_KEY=stub-anon-key
          EOF

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Test
        run: pnpm test

      - name: Typecheck
        run: pnpm build:typecheck

      - name: Build
        run: pnpm build
```

- [ ] **Step 2: YAML syntax sanity check**

Run from `E:\Projects\VibeOps`:
```bash
node -e "const y = require('fs').readFileSync('.github/workflows/test.yml', 'utf8'); console.log('lines:', y.split('\n').length); console.log('contains required keys:', ['name:', 'on:', 'jobs:', 'runs-on: windows-latest', 'pnpm test', 'pnpm build:typecheck', 'pnpm build'].every(k => y.includes(k)));"
```
Expected: `lines: 38` (or close), `contains required keys: true`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci: add Test workflow (pnpm test + typecheck + build on PR + push to main)"
```

---

# PHASE B — Push + Verify

## Task B1: Push to main, observe first run

**Files:** none modified.

This task pushes the workflow and watches its first run.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Confirm GitHub Actions started**

Either:
- Open `https://github.com/tdube-architech/VibeOps/actions` in browser, OR
- Run: `gh run list --workflow=test.yml --limit=1`

Expected: a run for the push event appears, status `in_progress` or `queued`.

- [ ] **Step 3: Wait for first run to finish**

```bash
gh run watch
```

Or refresh the Actions page. First run will be slower than steady-state because:
- pnpm cache cold (no prior key for this lockfile).
- better-sqlite3 native rebuild required.
- Expected total: ~6-10 min.

Expected outcome: green. Test count `162 passed`. Typecheck green. Build green.

- [ ] **Step 4: If RED, diagnose**

Common failure modes and fixes:
- `pnpm install` exit non-zero on Windows runner: confirm `pnpm/action-setup@v4` resolves pnpm 10. Pinning `version: 10` should work; if not, try `version: 10.30.1` to match local lockfile generator.
- `pretest` rebuild fails because Windows runner lacks build tools: GitHub-hosted `windows-latest` includes Visual Studio Build Tools by default, so this is unlikely. If it does happen, add `- name: Setup build tools` step using `microsoft/setup-msbuild@v2`.
- `pnpm build` fails because Vite cannot read .env: confirm the `Write stub .env` step ran before `Install` and produced the file in the workspace root. Add `ls -la .env` debug step before `Install` if needed.
- Test failures that pass locally: capture the Actions log; rerun locally with `pnpm test` to reproduce. Most likely Windows path-separator or temp-dir cleanup races; address case-by-case (NOT in scope for this plan — file as a follow-up).

Do NOT proceed to B2 until B1 is green.

- [ ] **Step 5: Confirmation comment in commit log**

If the run goes green on first try, no further action.

If you had to fix the workflow (e.g., adjust pnpm version pin), commit those fixes with messages like `ci: pin pnpm to 10.30.1 to match lockfile` and push, then return to Step 2.

---

## Task B2: Open verification PR

**Files:**
- Create temporary: `docs/superpowers/notes/ci-smoke.md` (will be deleted in same PR before merge OR left as a marker file)

This task validates the `pull_request` trigger by opening a no-op PR.

- [ ] **Step 1: Branch + harmless commit**

```bash
git checkout -b ci-smoke
mkdir -p docs/superpowers/notes
cat > docs/superpowers/notes/ci-smoke.md <<'EOF'
# CI smoke
Touched only to verify the Test workflow fires on pull_request events.
EOF
git add docs/superpowers/notes/ci-smoke.md
git commit -m "test(ci): no-op PR to verify Test workflow fires on pull_request"
git push -u origin ci-smoke
```

- [ ] **Step 2: Open PR via gh**

```bash
gh pr create --title "ci-smoke: verify Test workflow" --body "No-op PR. Validates that the new Test workflow runs on pull_request events."
```

- [ ] **Step 3: Wait for PR CI**

```bash
gh pr checks --watch
```

Expected: the Test workflow appears, runs, finishes green. Should be faster than B1 step 3 because pnpm cache is warm.

- [ ] **Step 4: Close PR without merging**

```bash
gh pr close ci-smoke --delete-branch
```

Smoke-test branch + PR cleaned up.

---

# PHASE C — Finalize

## Task C1: Update spec status + tag

**Files:**
- Modify: `docs/superpowers/specs/2026-05-11-phase-8-test-ci-design.md` (status line only)

- [ ] **Step 1: Flip spec status**

Change `**Status:** Approved (brainstorm)` to `**Status:** Shipped`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-11-phase-8-test-ci-design.md
git commit -m "docs: mark phase-8 spec shipped"
```

- [ ] **Step 3: Tag**

```bash
git tag -a phase-8-test-ci -m "Phase 8 complete: CI Test workflow (pnpm test + typecheck + build on PR + push to main)"
```

- [ ] **Step 4: Push tag**

```bash
git push origin main
git push origin phase-8-test-ci
```

---

# Self-Review Notes

**Spec coverage:**
- [x] `.github/workflows/test.yml` created — A1.
- [x] Trigger = `pull_request` + `push: branches: [main]` — A1 Step 1.
- [x] Runner = `windows-latest` — A1 Step 1.
- [x] pnpm 10, Node 20, `cache: 'pnpm'` — A1 Step 1.
- [x] Stub .env via shell heredoc with the four required keys — A1 Step 1.
- [x] Step order: install → test → typecheck → build — A1 Step 1.
- [x] Acceptance steps 1, 2, 3 (workflow lands, runs on push, runs on PR) — B1 + B2.
- [x] Acceptance step 5 (marker = electron-v130 after run) — implicit; phase-7.5 posttest + prepackage guarantee this.
- [N/A] Acceptance step 4 (intentional break → red): out of scope for the plan; ad-hoc verification by user.
- [x] Tag + spec status update — C1.

**Placeholder scan:** no TBD/TODO/"appropriate error handling"/"similar to" patterns. B1 Step 4 lists specific known failure modes with specific fixes — no generic "diagnose and fix".

**Type consistency:** N/A (no TypeScript surface).

**Risks (carried from spec):**
- pnpm 10 on `pnpm/action-setup@v4` — used by release.yml today, low risk.
- Windows runner build-tools availability — GitHub-hosted runner includes VS Build Tools by default. B1 Step 4 documents the unlikely fix.
- Cache key collision between `release.yml` and `test.yml` (both use `cache: 'pnpm'`) — none; setup-node scopes cache per repo+workflow+key.

**Out of plan (deferred follow-ups):**
- Branch protection rules requiring `test` check — user action in repo settings.
- Concurrency cancellation, status badge, coverage upload — deferred until needed.
- Linux/macOS matrix — deferred until external contributors join.
