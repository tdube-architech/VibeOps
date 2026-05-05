-- In-app notifications: per-user delivery, realtime via supabase_realtime publication.

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  type          text not null,
  title         text not null,
  body          text,
  link          text,
  payload       jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_self_select on public.notifications for select
  using (user_id = auth.uid());

create policy notifications_self_update on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_self_delete on public.notifications for delete
  using (user_id = auth.uid());

-- inserts only via SECURITY DEFINER triggers / RPCs (no INSERT policy for client)

-- Enable realtime broadcast on this table
alter publication supabase_realtime add table public.notifications;

-- =====================================================================
-- triggers
-- =====================================================================

-- on workspace_members INSERT: notify the new member + workspace owner
create or replace function public.notify_workspace_member_added() returns trigger as $$
declare
  ws record;
  inviter_email text;
begin
  select w.id, w.name, w.owner_id into ws from public.workspaces w where w.id = new.workspace_id;
  if not found then return new; end if;

  -- Notify the new member (skip if they're the owner being auto-added at workspace creation)
  if new.user_id <> ws.owner_id then
    insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
    values (
      new.user_id, ws.id,
      'workspace.joined',
      'Welcome to ' || ws.name,
      'You joined the workspace as ' || new.role || '.',
      null,
      jsonb_build_object('role', new.role, 'workspace_name', ws.name)
    );
  end if;

  -- Notify the owner (skip if they're the one joining their own ws)
  if ws.owner_id <> new.user_id then
    select email into inviter_email from public.profiles where user_id = new.user_id;
    insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
    values (
      ws.owner_id, ws.id,
      'workspace.member_joined',
      coalesce(inviter_email, 'Someone') || ' joined ' || ws.name,
      'They are now ' || new.role || ' in this workspace.',
      null,
      jsonb_build_object('role', new.role, 'new_member_id', new.user_id, 'new_member_email', inviter_email)
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger workspace_members_notify
  after insert on public.workspace_members
  for each row execute function public.notify_workspace_member_added();

-- on project_members INSERT: notify the user added
create or replace function public.notify_project_member_added() returns trigger as $$
declare
  proj record;
begin
  select p.id, p.name, p.workspace_id into proj from public.projects p where p.id = new.project_id;
  if not found then return new; end if;

  insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
  values (
    new.user_id, proj.workspace_id,
    'project.added',
    'You were added to ' || proj.name,
    'You can now view and edit this project.',
    '#/projects/' || proj.id,
    jsonb_build_object('project_id', proj.id, 'project_name', proj.name, 'role', new.role)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger project_members_notify
  after insert on public.project_members
  for each row execute function public.notify_project_member_added();

-- =====================================================================
-- helper RPCs
-- =====================================================================

create or replace function public.mark_all_notifications_read()
returns void as $$
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid() and read_at is null;
end;
$$ language plpgsql security definer;
grant execute on function public.mark_all_notifications_read() to authenticated;
