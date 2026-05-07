-- Teams: groups of users within a workspace. Backfill creates a default
-- "Everyone" team per workspace containing all current members.
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index teams_workspace_idx on public.teams (workspace_id);

create table if not exists public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('lead','member')),
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy teams_select on public.teams for select
  using (public.is_workspace_member(workspace_id));

create policy teams_modify on public.teams for all
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

create policy team_members_select on public.team_members for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy team_members_modify on public.team_members for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_writer(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_writer(t.workspace_id)
    )
  );

-- Backfill: one "Everyone" team per workspace, populated with every current member.
do $$
declare ws record; t_id uuid;
begin
  for ws in select id from public.workspaces loop
    insert into public.teams (workspace_id, name)
    values (ws.id, 'Everyone')
    on conflict (workspace_id, name) do update set name = excluded.name
    returning id into t_id;
    if t_id is null then
      select id into t_id from public.teams where workspace_id = ws.id and name = 'Everyone';
    end if;
    insert into public.team_members (team_id, user_id, role)
    select t_id, user_id, 'member' from public.workspace_members where workspace_id = ws.id
    on conflict do nothing;
  end loop;
end $$;

-- Trigger: auto-add new workspace members to "Everyone".
create or replace function public.tm_default_team_join() returns trigger as $$
declare t_id uuid;
begin
  select id into t_id from public.teams where workspace_id = new.workspace_id and name = 'Everyone';
  if t_id is null then
    insert into public.teams (workspace_id, name) values (new.workspace_id, 'Everyone') returning id into t_id;
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (t_id, new.user_id, 'member') on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists workspace_members_default_team on public.workspace_members;
create trigger workspace_members_default_team
  after insert on public.workspace_members
  for each row execute function public.tm_default_team_join();

alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.team_members;
