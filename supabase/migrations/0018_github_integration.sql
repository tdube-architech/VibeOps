-- Phase D3: GitHub integration.
-- user_github_credentials stores each user's GitHub username and a PAT they
-- supply for VibeOps to call the GitHub API on their behalf. PAT is stored
-- as text for now (TODO: vault-encrypt) but RLS restricts read+write to
-- the owning user.
create table public.user_github_credentials (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  github_username  text not null,
  encrypted_pat    text,
  scopes           text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

create type project_grant_status as enum ('pending', 'granted', 'revoked', 'failed');

create table public.project_grants (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  member_user_id  uuid not null references auth.users (id) on delete cascade,
  github_username text not null,
  status          project_grant_status not null default 'pending',
  granted_at      timestamptz,
  revoked_at      timestamptz,
  error_message   text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (project_id, member_user_id)
);
create index project_grants_project_idx on public.project_grants (project_id);
create index project_grants_pending_idx on public.project_grants (status) where status in ('pending', 'failed');

alter table public.user_github_credentials enable row level security;
alter table public.project_grants          enable row level security;

-- Each user manages only their own credentials. The PAT column is never
-- exposed to other users; the edge function reads it via service role.
create policy ugc_self_select on public.user_github_credentials for select
  using (user_id = auth.uid());
create policy ugc_self_modify on public.user_github_credentials for insert
  with check (user_id = auth.uid());
create policy ugc_self_update on public.user_github_credentials for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ugc_self_delete on public.user_github_credentials for delete
  using (user_id = auth.uid());

-- Workspace members can see grants on projects they can see; only the
-- workspace owner triggers grant changes (writes go through the edge
-- function with service role).
create policy pg_select on public.project_grants for select
  using (public.is_project_visible(project_id));

alter publication supabase_realtime add table public.project_grants;

-- =====================================================================
-- Helper RPC: list github usernames for current workspace members so the
-- renderer can summarize who has GitHub linked.
-- =====================================================================
create or replace function public.workspace_github_status(ws_id uuid)
returns table (
  user_id        uuid,
  email          text,
  github_username text,
  has_pat        boolean
) language sql security definer as $$
  select
    m.user_id,
    p.email,
    g.github_username,
    g.encrypted_pat is not null
  from public.workspace_members m
  left join public.profiles p on p.user_id = m.user_id
  left join public.user_github_credentials g on g.user_id = m.user_id
  where m.workspace_id = ws_id
    and public.is_workspace_member(ws_id);
$$;
