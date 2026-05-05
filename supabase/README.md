# VibeOps Supabase

Server-side schema, RLS, quotas, and RPCs.

## Local dev

```bash
# install Supabase CLI: https://supabase.com/docs/guides/cli
supabase start                   # spins up local Postgres + Studio + Auth
supabase db reset                # applies migrations + seed.sql
```

Studio: http://localhost:54323
Postgres: localhost:54322 / postgres / postgres
Anon key + service role key printed by `supabase start`.

## Apply to remote project

```bash
supabase login
supabase link --project-ref <ref>
supabase db push                 # applies pending migrations to remote
```

## Migrations

| File | Purpose |
|---|---|
| `0001_init.sql` | Tables, enums, profile auto-create trigger, owner-add-on-workspace-create trigger |
| `0002_rls.sql` | Row-Level Security on every shared table |
| `0003_quotas.sql` | Free-tier 5-member cap, 1-owned-workspace cap, audit/activity retention crons |
| `0004_invitations_rpc.sql` | `accept_invitation(token)` RPC for the web companion |

## OAuth (GitHub)

GitHub OAuth app: https://github.com/settings/applications/new

- Homepage: `https://vibeops.app`
- Callback: `https://<your-supabase-project>.supabase.co/auth/v1/callback`

Set Supabase env: `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`.

## Custom redirect for desktop app

Supabase auth → custom URL scheme `vibeops://auth` is allowed via `additional_redirect_urls` in `config.toml`. The web companion's `/auth/desktop-handoff` page deep-links into the desktop with the session tokens.
