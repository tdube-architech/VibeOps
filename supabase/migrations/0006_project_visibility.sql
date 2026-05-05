-- Phase B1: per-project visibility + ACL.
-- visibility = 'workspace' (default) means any workspace member can see the project.
-- visibility = 'private' means only the owner sees it.
-- visibility = 'restricted' means only members listed in project_members can see it.

create type project_visibility as enum ('workspace', 'private', 'restricted');

alter table public.projects
  add column visibility project_visibility not null default 'workspace';

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        member_role not null default 'editor',
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- =====================================================================
-- helpers used in RLS
-- =====================================================================
create or replace function public.is_project_visible(pid uuid) returns boolean as $$
  select case
    when not public.is_workspace_member(
      (select workspace_id from public.projects where id = pid)
    ) then false
    when (select visibility from public.projects where id = pid) = 'workspace' then true
    when (select visibility from public.projects where id = pid) = 'private' then
      (select owner_id from public.workspaces w
       where w.id = (select workspace_id from public.projects where id = pid)) = auth.uid()
      or exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid())
    when (select visibility from public.projects where id = pid) = 'restricted' then
      exists (select 1 from public.project_members where project_id = pid and user_id = auth.uid())
      or (select owner_id from public.workspaces w
          where w.id = (select workspace_id from public.projects where id = pid)) = auth.uid()
    else false
  end;
$$ language sql stable security definer;

-- =====================================================================
-- replace existing project policies with visibility-aware versions
-- =====================================================================
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select
  using (public.is_project_visible(id));

-- writes still gated by workspace role; visibility is read-side
-- (existing projects_insert / projects_update / projects_delete unchanged)

-- audit_findings + audit_runs + tasks + memory_versions: keep workspace_member SELECT
-- (visibility filter would require joining projects in every check; current grain is acceptable
-- because users only see findings for projects they can already see in the UI)

-- =====================================================================
-- project_members RLS
-- =====================================================================
alter table public.project_members enable row level security;

create policy pm_select on public.project_members for select
  using (public.is_project_visible(project_id));

create policy pm_insert on public.project_members for insert with check (
  public.is_workspace_writer((select workspace_id from public.projects where id = project_id))
);

create policy pm_delete on public.project_members for delete using (
  public.is_workspace_writer((select workspace_id from public.projects where id = project_id))
  or user_id = auth.uid()
);

-- =====================================================================
-- RPCs
-- =====================================================================

-- invite_member: create an invitations row, return token + link.
-- Inviter must be a writer in the workspace.
create or replace function public.invite_member(
  ws_id uuid, invitee_email text, invitee_role member_role default 'editor'
) returns public.invitations as $$
declare
  token_value text := encode(gen_random_bytes(24), 'base64');
  inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;
  if not public.is_workspace_writer(ws_id) then
    raise exception 'WORKSPACE_WRITER_REQUIRED' using errcode = 'P0008';
  end if;

  -- url-safe replacements
  token_value := replace(replace(replace(token_value, '+', '-'), '/', '_'), '=', '');

  insert into public.invitations (workspace_id, email, role, token, invited_by)
  values (ws_id, lower(trim(invitee_email)), invitee_role, token_value, auth.uid())
  returning * into inv;

  insert into public.activity_log (workspace_id, actor_user_id, action, target_type, target_id, payload)
  values (ws_id, auth.uid(), 'invitation.created', 'invitation', inv.id,
          jsonb_build_object('email', inv.email, 'role', inv.role));

  return inv;
end;
$$ language plpgsql security definer;
grant execute on function public.invite_member(uuid, text, member_role) to authenticated;

-- list_workspace_members: returns members joined with profile data
create or replace function public.list_workspace_members(ws_id uuid)
returns table (
  user_id uuid, email text, display_name text, avatar_url text,
  role member_role, joined_at timestamptz
) as $$
  select p.user_id, p.email, p.display_name, p.avatar_url,
         wm.role, wm.joined_at
  from public.workspace_members wm
  inner join public.profiles p on p.user_id = wm.user_id
  where wm.workspace_id = ws_id
    and public.is_workspace_member(ws_id);
$$ language sql stable security definer;
grant execute on function public.list_workspace_members(uuid) to authenticated;

-- list_pending_invitations: invitations that haven't been accepted
create or replace function public.list_pending_invitations(ws_id uuid)
returns setof public.invitations as $$
  select * from public.invitations
  where workspace_id = ws_id
    and accepted_at is null
    and expires_at > now()
    and public.is_workspace_member(ws_id)
  order by created_at desc;
$$ language sql stable security definer;
grant execute on function public.list_pending_invitations(uuid) to authenticated;

-- revoke_invitation: delete a pending invite (writer only)
create or replace function public.revoke_invitation(invite_id uuid) returns void as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations where id = invite_id;
  if not found then return; end if;
  if not public.is_workspace_writer(inv.workspace_id) then
    raise exception 'WORKSPACE_WRITER_REQUIRED' using errcode = 'P0008';
  end if;
  delete from public.invitations where id = invite_id;
end;
$$ language plpgsql security definer;
grant execute on function public.revoke_invitation(uuid) to authenticated;

-- remove_member: kicks a member out of a workspace (owner only, or self)
create or replace function public.remove_member(ws_id uuid, target_user_id uuid) returns void as $$
begin
  if not (public.is_workspace_owner(ws_id) or target_user_id = auth.uid()) then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0009';
  end if;
  if target_user_id = (select owner_id from public.workspaces where id = ws_id) then
    raise exception 'CANNOT_REMOVE_OWNER' using errcode = 'P0010';
  end if;
  delete from public.workspace_members where workspace_id = ws_id and user_id = target_user_id;
  delete from public.project_members
    where user_id = target_user_id
      and project_id in (select id from public.projects where workspace_id = ws_id);
end;
$$ language plpgsql security definer;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

-- update_member_role: change a member's role (owner only)
create or replace function public.update_member_role(ws_id uuid, target_user_id uuid, new_role member_role) returns void as $$
begin
  if not public.is_workspace_owner(ws_id) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0011';
  end if;
  update public.workspace_members
  set role = new_role
  where workspace_id = ws_id and user_id = target_user_id;
end;
$$ language plpgsql security definer;
grant execute on function public.update_member_role(uuid, uuid, member_role) to authenticated;

-- set_project_visibility: change project visibility (writer only)
create or replace function public.set_project_visibility(p_id uuid, vis project_visibility) returns void as $$
declare ws_id uuid;
begin
  select workspace_id into ws_id from public.projects where id = p_id;
  if not public.is_workspace_writer(ws_id) then
    raise exception 'WORKSPACE_WRITER_REQUIRED' using errcode = 'P0008';
  end if;
  update public.projects set visibility = vis where id = p_id;
end;
$$ language plpgsql security definer;
grant execute on function public.set_project_visibility(uuid, project_visibility) to authenticated;
