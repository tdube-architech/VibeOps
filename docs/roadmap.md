# Roadmap

> Reconciled 2026-05-11 against shipped state. Last tag: `phase-7-tasks-collab`. Current version: v0.0.27.

## Shipped (post original roadmap)
- **Cloud sync** — Supabase Postgres + Realtime; project + scan mirroring.
- **Team workspaces** — workspaces, members, invitations, RLS.
- **Teams** — `teams` + `team_members` schema, RLS, `Everyone` backfill, settings UI (phase 7).
- **Tasks kanban** — DnD (`@dnd-kit`), trash dock + 30d cron purge, popout w/ assignee + watchers + mentions, filter bar, in-column reorder (post-tag), unread comment bubble.
- **Project chat** — sessions, transcript, composer, dashboard preview.
- **Git status detection** — `gitInfo` IPC; rendered in `ProjectOverviewTab` + `ProjectGitTab`.
- **Typography pass** — `t-h1/t-h2/t-meta` utilities applied app-wide.
- **CI test workflow** — `.github/workflows/test.yml` (phase 8): pnpm test + typecheck + build on PR + push to main.
- **Stripe billing** — subscriptions, checkout, portal, webhook edge fn.
- **GitHub integration** — list orgs, create/check repo, grant collab edge fns.
- **AI session diff-watch + memory generator** — chokidar-based watchers.

## V1.1 — Remaining
- Prompt history with outcome notes (UI + store).
- Auto-generate tasks from audit findings (findings→tasks bridge).
- Export handoff docs (CLAUDE.md, AGENTS.md, README, docs/*) per project.
- Multi-provider comparison (today: anthropic + mock only; add 1-2 real providers).

## V1.2 — AI deepening
- Claude Agent SDK integration (replace bespoke wrapper in `src/main/ai`).
- Codex / OpenAI SDK integration.
- File-level semantic search (embeddings + retrieval).
- Cost tracking (token + USD per session).

## V2 — Background intelligence
- Auto-refresh memory after Git commits.
- Background project watching (poll or fs events on all registered projects).
- Audit comparison over time (history view + diffing).
- Release-notes / handoff-report generation.

## V3 — Reach
- Hosted dashboard (web companion).
- Project templates marketplace.
- Public sharing of project memory (opt-in).
