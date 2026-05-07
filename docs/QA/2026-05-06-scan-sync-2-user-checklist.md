# Scan Sync 2-User Manual Verify (commit 595db53)

Goal: prove cloud-mirrored scan results are visible to teammates without re-running the scan.

## Setup

1. Two distinct Supabase auth users: A (owner) and B (editor).
2. A and B share workspace `WS-Test`.
3. A creates cloud project `Proj-Sync` (visibility: workspace).
4. Confirm B sees `Proj-Sync` in their project list.

## Steps as User A

1. Open `Proj-Sync` → Scan tab.
2. Click "Run scan". Wait for completion (status `completed`, file count > 0).
3. Inspect Supabase dashboard → Table Editor → `project_scans`. Confirm one row for the project, `summary` jsonb populated, `scanned_by = A`.
4. Inspect `project_scan_files` — file rows present (`scan_id` matches the scan).
5. Inspect `project_scan_env_vars` — env rows if any detected.

## Steps as User B

6. Sign out A. Sign in B.
7. Open `Proj-Sync` → Scan tab.
8. Confirm:
   - Primary stack matches what A saw.
   - File count matches.
   - Detected env vars list matches.
   - "Last scanned by" shows A's email.
   - "Last scanned at" timestamp matches.
9. Confirm B can NOT trigger a scan locally on a project that lives in A's checkout (cloud-only path is read-only for B).

## RLS sanity

10. As B, attempt direct read of `project_scans` for a project NOT in `WS-Test`:

    select id from project_scans where project_id = '<other-ws-project>';

    Expected: empty.

## Failure modes

- If B sees empty Scan tab: check `useScans` cloud branch returns the latest cloud row.
- If B sees stale data: invalidate query cache on focus.
- If B gets RLS error: confirm `is_project_visible` includes workspace_members shortcut for cloud projects.

## Result

- All steps pass on production env / staging env / local: yes / no
- Tested on date: ____________ by: ____________
