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
| `0004_invitations_rpc.sql` | `accept_invitation(token)` RPC for the desktop app |

## OAuth (GitHub)

GitHub OAuth app: https://github.com/settings/applications/new

- Homepage: `https://github.com/tdube-architech/VibeOps`
- Callback: `https://<your-supabase-project>.supabase.co/auth/v1/callback`

Set Supabase env: `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`.

## Desktop deep-link flow

All auth + invite acceptance runs through the Electron app via the
`vibeops://` custom URL scheme. The desktop registers itself as the
default protocol handler on install.

Allowed redirects (set in Supabase → Authentication → URL Configuration):
- `vibeops://auth/callback`
- `vibeops://accept-invite/*`

Sign-in flow:
1. App opens `https://<ref>.supabase.co/auth/v1/authorize?provider=github&redirect_to=vibeops://auth/callback` in the system browser via `shell.openExternal`.
2. GitHub OAuth → Supabase callback → Supabase redirects browser to `vibeops://auth/callback?code=...`.
3. OS launches the desktop app via the protocol handler.
4. App captures the URL, exchanges the code for a session, persists tokens with `safeStorage`, signs the user in.

Magic-link flow: same shape — `signInWithOtp` with `emailRedirectTo: 'vibeops://auth/callback'`.

Invitation flow: workspace owner enters invitee email → app calls Edge
function `send-invitation` → email contains `vibeops://accept-invite/<token>` → recipient clicks → desktop handles deep link → calls `accept_invitation(token)` RPC.
