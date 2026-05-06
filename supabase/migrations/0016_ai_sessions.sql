-- Phase C2/C3/C4: shared AI sessions.
-- ai_sessions row created when a workspace member starts a CLI session in
-- a cloud project. Output streamed via ai_session_events so teammates can
-- spectate via Realtime. AI-proposed file changes captured into
-- ai_session_diffs for PR-style review.

create type ai_session_status as enum ('starting', 'active', 'ended', 'failed');

create table public.ai_sessions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  provider      text not null,           -- 'claude' | 'codex' | 'shell' | other
  command       text not null,
  args          text[] not null default '{}',
  cwd           text,
  label         text,
  status        ai_session_status not null default 'starting',
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  exit_code     int,
  client_local_id text  -- the local terminal session id mapping
);
create index ai_sessions_project_idx on public.ai_sessions (project_id, started_at desc);
create index ai_sessions_owner_idx   on public.ai_sessions (owner_user_id, started_at desc);
create index ai_sessions_active_idx  on public.ai_sessions (workspace_id) where status in ('starting', 'active');

create type ai_event_kind as enum (
  'stdout', 'stderr', 'stdin',
  'prompt', 'response',
  'tool_call', 'tool_result',
  'file_diff', 'system'
);

create table public.ai_session_events (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.ai_sessions (id) on delete cascade,
  kind          ai_event_kind not null,
  payload       text,                    -- raw chunk or short text
  payload_json  jsonb,                   -- structured event data
  ts            timestamptz not null default now()
);
create index ai_session_events_session_idx on public.ai_session_events (session_id, ts);

create table public.ai_session_diffs (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.ai_sessions (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  file_path    text not null,
  diff_kind    text not null check (diff_kind in ('create', 'modify', 'delete')),
  before_hash  text,
  after_hash   text,
  size_bytes   int,
  status       text not null default 'proposed' check (status in ('proposed', 'applied', 'reverted', 'rejected')),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index ai_session_diffs_session_idx on public.ai_session_diffs (session_id, created_at);
create index ai_session_diffs_project_idx on public.ai_session_diffs (project_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.ai_sessions       enable row level security;
alter table public.ai_session_events enable row level security;
alter table public.ai_session_diffs  enable row level security;

-- Sessions: visible to anyone who can see the project (so teammates can spectate).
create policy ai_sessions_select on public.ai_sessions for select
  using (public.is_project_visible(project_id));
create policy ai_sessions_insert on public.ai_sessions for insert
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and owner_user_id = auth.uid()
  );
create policy ai_sessions_update on public.ai_sessions for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy ai_sessions_delete on public.ai_sessions for delete
  using (owner_user_id = auth.uid() or public.is_workspace_owner(workspace_id));

-- Events: read-only for project viewers; insert restricted to session owner.
create policy ai_events_select on public.ai_session_events for select
  using (exists (
    select 1 from public.ai_sessions s
    where s.id = session_id and public.is_project_visible(s.project_id)
  ));
create policy ai_events_insert on public.ai_session_events for insert
  with check (exists (
    select 1 from public.ai_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));

-- Diffs: visible to project viewers; insert by owner; status update by writers.
create policy ai_diffs_select on public.ai_session_diffs for select
  using (public.is_project_visible(project_id));
create policy ai_diffs_insert on public.ai_session_diffs for insert
  with check (exists (
    select 1 from public.ai_sessions s
    where s.id = session_id and s.owner_user_id = auth.uid()
  ));
create policy ai_diffs_update on public.ai_session_diffs for update
  using (public.is_workspace_writer((select workspace_id from public.ai_sessions where id = session_id)))
  with check (public.is_workspace_writer((select workspace_id from public.ai_sessions where id = session_id)));

-- Realtime publication
alter publication supabase_realtime add table public.ai_sessions;
alter publication supabase_realtime add table public.ai_session_events;
alter publication supabase_realtime add table public.ai_session_diffs;

-- =====================================================================
-- C4: concurrent session quota
-- Free: 1 concurrent session per user
-- Pro: 5 concurrent per user (lightweight first cap)
-- =====================================================================
create or replace function public.check_ai_session_quota() returns trigger as $$
declare
  ws_plan plan_tier;
  active_count int;
  cap int;
begin
  if new.status not in ('starting', 'active') then
    return new;
  end if;
  select plan into ws_plan from public.workspaces where id = new.workspace_id;
  cap := case when ws_plan = 'pro' then 5 else 1 end;
  select count(*) into active_count
  from public.ai_sessions
  where owner_user_id = new.owner_user_id
    and status in ('starting', 'active');
  if active_count >= cap then
    raise exception 'AI_SESSION_LIMIT'
      using errcode = 'P0017',
            hint = format('You can have at most %s concurrent AI session(s) on this plan.', cap);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists ai_sessions_quota on public.ai_sessions;
create trigger ai_sessions_quota
  before insert on public.ai_sessions
  for each row execute function public.check_ai_session_quota();

-- =====================================================================
-- Reaper: mark stuck 'active' rows as ended after 60 min idle.
-- =====================================================================
create or replace function public.reap_stuck_ai_sessions() returns void as $$
begin
  update public.ai_sessions
  set status = 'ended',
      ended_at = now()
  where status in ('starting', 'active')
    and started_at < now() - interval '60 minutes'
    and not exists (
      select 1 from public.ai_session_events e
      where e.session_id = ai_sessions.id
        and e.ts > now() - interval '5 minutes'
    );
end;
$$ language plpgsql security definer;

select cron.schedule('vibeops-reap-ai-sessions', '*/5 * * * *',
  $$select public.reap_stuck_ai_sessions();$$);
