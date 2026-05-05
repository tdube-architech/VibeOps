-- Row-Level Security: every shared table is workspace-scoped.
-- Reads: any member of the workspace. Writes: owner+editor; owner-only for destructive ops.

-- =====================================================================
-- helper: workspace membership and role lookup
-- =====================================================================
create or replace function public.is_workspace_member(ws_id uuid) returns boolean as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws_id and user_id = auth.uid()
  );
$$ language sql stable security definer;

create or replace function public.workspace_role(ws_id uuid) returns member_role as $$
  select role from public.workspace_members
  where workspace_id = ws_id and user_id = auth.uid()
  limit 1;
$$ language sql stable security definer;

create or replace function public.is_workspace_writer(ws_id uuid) returns boolean as $$
  select public.workspace_role(ws_id) in ('owner', 'editor');
$$ language sql stable security definer;

create or replace function public.is_workspace_owner(ws_id uuid) returns boolean as $$
  select public.workspace_role(ws_id) = 'owner';
$$ language sql stable security definer;

-- =====================================================================
-- profiles
-- =====================================================================
alter table public.profiles enable row level security;

create policy profiles_self_select on public.profiles for select
  using (user_id = auth.uid()
         or user_id in (
           select wm.user_id from public.workspace_members wm
           where wm.workspace_id in (
             select workspace_id from public.workspace_members where user_id = auth.uid()
           )
         ));

create policy profiles_self_update on public.profiles for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- workspaces
-- =====================================================================
alter table public.workspaces enable row level security;

create policy workspaces_member_select on public.workspaces for select
  using (public.is_workspace_member(id));

create policy workspaces_owner_create on public.workspaces for insert
  with check (owner_id = auth.uid());

create policy workspaces_owner_update on public.workspaces for update
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

create policy workspaces_owner_delete on public.workspaces for delete
  using (public.is_workspace_owner(id));

-- =====================================================================
-- workspace_members
-- =====================================================================
alter table public.workspace_members enable row level security;

create policy members_member_select on public.workspace_members for select
  using (public.is_workspace_member(workspace_id));

create policy members_owner_insert on public.workspace_members for insert
  with check (public.is_workspace_owner(workspace_id));

create policy members_owner_update on public.workspace_members for update
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy members_owner_or_self_delete on public.workspace_members for delete
  using (public.is_workspace_owner(workspace_id) or user_id = auth.uid());

-- =====================================================================
-- invitations
-- =====================================================================
alter table public.invitations enable row level security;

create policy invitations_member_select on public.invitations for select
  using (public.is_workspace_member(workspace_id));

create policy invitations_writer_insert on public.invitations for insert
  with check (public.is_workspace_writer(workspace_id) and invited_by = auth.uid());

create policy invitations_writer_delete on public.invitations for delete
  using (public.is_workspace_writer(workspace_id));

-- =====================================================================
-- generic policies for workspace-scoped resource tables
-- pattern: SELECT for members, INSERT/UPDATE for writers, DELETE for owner
-- =====================================================================

-- projects
alter table public.projects enable row level security;
create policy projects_select on public.projects for select using (public.is_workspace_member(workspace_id));
create policy projects_insert on public.projects for insert with check (public.is_workspace_writer(workspace_id));
create policy projects_update on public.projects for update using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
create policy projects_delete on public.projects for delete using (public.is_workspace_owner(workspace_id));

-- project_user_state (per-user; only the user can read/write their own row)
alter table public.project_user_state enable row level security;
create policy pus_select on public.project_user_state for select using (user_id = auth.uid());
create policy pus_insert on public.project_user_state for insert with check (user_id = auth.uid());
create policy pus_update on public.project_user_state for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pus_delete on public.project_user_state for delete using (user_id = auth.uid());

-- audit_runs
alter table public.audit_runs enable row level security;
create policy ar_select on public.audit_runs for select using (public.is_workspace_member(workspace_id));
create policy ar_insert on public.audit_runs for insert with check (public.is_workspace_writer(workspace_id) and run_by_user_id = auth.uid());
create policy ar_update on public.audit_runs for update using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
create policy ar_delete on public.audit_runs for delete using (public.is_workspace_owner(workspace_id));

-- audit_findings
alter table public.audit_findings enable row level security;
create policy af_select on public.audit_findings for select using (public.is_workspace_member(workspace_id));
create policy af_insert on public.audit_findings for insert with check (public.is_workspace_writer(workspace_id));
create policy af_update on public.audit_findings for update using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
create policy af_delete on public.audit_findings for delete using (public.is_workspace_owner(workspace_id));

-- tasks
alter table public.tasks enable row level security;
create policy tasks_select on public.tasks for select using (public.is_workspace_member(workspace_id));
create policy tasks_insert on public.tasks for insert with check (public.is_workspace_writer(workspace_id) and created_by = auth.uid());
create policy tasks_update on public.tasks for update using (public.is_workspace_writer(workspace_id)) with check (public.is_workspace_writer(workspace_id));
create policy tasks_delete on public.tasks for delete using (public.is_workspace_writer(workspace_id));

-- memory_versions
alter table public.memory_versions enable row level security;
create policy mv_select on public.memory_versions for select using (public.is_workspace_member(workspace_id));
create policy mv_insert on public.memory_versions for insert with check (public.is_workspace_writer(workspace_id) and authored_by_user_id = auth.uid());

-- chat sessions/messages: owner-only for now (private chats); workspace members cannot see other users' chats
alter table public.chat_sessions enable row level security;
create policy cs_select on public.chat_sessions for select using (owner_user_id = auth.uid());
create policy cs_insert on public.chat_sessions for insert with check (owner_user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy cs_update on public.chat_sessions for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy cs_delete on public.chat_sessions for delete using (owner_user_id = auth.uid());

alter table public.chat_messages enable row level security;
create policy cm_select on public.chat_messages for select using (
  exists (select 1 from public.chat_sessions s where s.id = session_id and s.owner_user_id = auth.uid())
);
create policy cm_insert on public.chat_messages for insert with check (
  exists (select 1 from public.chat_sessions s where s.id = session_id and s.owner_user_id = auth.uid())
);

-- comments
alter table public.comments enable row level security;
create policy comments_select on public.comments for select using (public.is_workspace_member(workspace_id));
create policy comments_insert on public.comments for insert with check (public.is_workspace_writer(workspace_id) and author_user_id = auth.uid());
create policy comments_update on public.comments for update using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());
create policy comments_delete on public.comments for delete using (author_user_id = auth.uid() or public.is_workspace_owner(workspace_id));

-- activity_log: read-only for members; inserts via triggers/edge functions only (service role bypass)
alter table public.activity_log enable row level security;
create policy activity_select on public.activity_log for select using (public.is_workspace_member(workspace_id));
