-- VibeOps server schema v1
-- Multi-tenant collaboration foundation. All shared tables live in public schema
-- and are scoped by workspace_id. RLS enforced separately in 0002_rls.sql.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =====================================================================
-- enums
-- =====================================================================
create type plan_tier as enum ('free', 'pro');
create type member_role as enum ('owner', 'editor', 'viewer');
create type project_status as enum ('active', 'planning', 'needs_cleanup', 'critical', 'archived');
create type scan_status as enum ('queued', 'running', 'completed', 'failed', 'canceled');
create type audit_status as enum ('queued', 'running', 'completed', 'failed');
create type audit_kind as enum ('full', 'security-only', 'dependency-only', 'architecture-only');
create type finding_severity as enum ('critical', 'high', 'medium', 'low', 'info');
create type finding_category as enum ('architecture', 'security', 'dependency',
  'product-completeness', 'vibe-code-quality', 'deployment', 'documentation');
create type finding_status as enum ('open', 'wont-fix', 'fixed', 'ignored');
create type task_priority as enum ('critical', 'high', 'medium', 'low');
create type task_status as enum ('backlog', 'next', 'in_progress', 'blocked', 'done', 'ignored');
create type chat_role as enum ('user', 'assistant', 'system');
create type chat_purpose as enum ('project-chat', 'general');
create type memory_source as enum ('generated', 'merged', 'user-edited', 'imported');

-- =====================================================================
-- profiles (mirror of auth.users with display fields)
-- =====================================================================
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- backfill profile on signup via trigger on auth.users
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', new.email),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- workspaces + membership
-- =====================================================================
create table public.workspaces (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  owner_id        uuid not null references auth.users (id) on delete restrict,
  plan            plan_tier not null default 'free',
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          member_role not null default 'editor',
  joined_at     timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- auto-add owner on workspace creation
create or replace function public.add_workspace_owner_member() returns trigger as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger workspaces_add_owner
  after insert on public.workspaces
  for each row execute function public.add_workspace_owner_member();

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         text not null,
  role          member_role not null default 'editor',
  token         text not null unique,
  invited_by    uuid not null references auth.users (id) on delete restrict,
  expires_at    timestamptz not null default now() + interval '14 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users (id),
  created_at    timestamptz not null default now()
);
create index invitations_workspace_idx on public.invitations (workspace_id);
create index invitations_email_idx on public.invitations (email);

-- =====================================================================
-- projects (workspace-scoped) + per-user state (local path)
-- =====================================================================
create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  repo_url        text,
  category        text,
  tags            text[] not null default '{}',
  primary_stack   text,
  status          project_status not null default 'active',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_audited_at timestamptz,
  unique (workspace_id, slug)
);
create index projects_workspace_idx on public.projects (workspace_id);

create table public.project_user_state (
  project_id      uuid not null references public.projects (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  local_path      text,
  last_scanned_at timestamptz,
  last_synced_at  timestamptz,
  primary key (project_id, user_id)
);

-- =====================================================================
-- audits + findings
-- =====================================================================
create table public.audit_runs (
  id                       uuid primary key default gen_random_uuid(),
  project_id               uuid not null references public.projects (id) on delete cascade,
  workspace_id             uuid not null references public.workspaces (id) on delete cascade,
  audit_type               audit_kind not null default 'full',
  status                   audit_status not null default 'queued',
  score                    int,
  risk_level               text,
  summary                  text,
  recommended_next_action  text,
  generated_prompt         text,
  provider                 text,
  model                    text,
  run_by_user_id           uuid not null references auth.users (id) on delete restrict,
  started_at               timestamptz not null default now(),
  completed_at             timestamptz,
  error_message            text
);
create index audit_runs_project_idx on public.audit_runs (project_id);
create index audit_runs_workspace_idx on public.audit_runs (workspace_id);

create table public.audit_findings (
  id                  uuid primary key default gen_random_uuid(),
  audit_run_id        uuid not null references public.audit_runs (id) on delete cascade,
  project_id          uuid not null references public.projects (id) on delete cascade,
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  severity            finding_severity not null,
  category            finding_category not null,
  title               text not null,
  description         text,
  file_path           text,
  line_start          int,
  line_end            int,
  recommendation      text,
  suggested_prompt    text,
  status              finding_status not null default 'open',
  resolved_by_user_id uuid references auth.users (id),
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);
create index audit_findings_run_idx on public.audit_findings (audit_run_id);
create index audit_findings_project_idx on public.audit_findings (project_id);

-- =====================================================================
-- tasks
-- =====================================================================
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects (id) on delete cascade,
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  source_finding_id  uuid references public.audit_findings (id) on delete set null,
  title              text not null,
  description        text,
  priority           task_priority not null default 'medium',
  status             task_status not null default 'backlog',
  assignee_user_id   uuid references auth.users (id),
  related_files      text[] not null default '{}',
  suggested_prompt   text,
  created_by         uuid not null references auth.users (id) on delete restrict,
  created_at         timestamptz not null default now(),
  completed_at       timestamptz
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_workspace_idx on public.tasks (workspace_id);
create index tasks_assignee_idx on public.tasks (assignee_user_id);

-- =====================================================================
-- memory versions
-- =====================================================================
create table public.memory_versions (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects (id) on delete cascade,
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  version               int not null,
  content               text not null,
  source                memory_source not null default 'user-edited',
  authored_by_user_id   uuid not null references auth.users (id) on delete restrict,
  scan_id               text,
  created_at            timestamptz not null default now(),
  unique (project_id, version)
);

-- =====================================================================
-- chat sessions + messages (per-user, workspace-visible if shared later)
-- =====================================================================
create table public.chat_sessions (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  project_id        uuid references public.projects (id) on delete cascade,
  owner_user_id     uuid not null references auth.users (id) on delete cascade,
  provider          text not null,
  model             text not null,
  purpose           chat_purpose not null default 'general',
  title             text,
  created_at        timestamptz not null default now()
);
create index chat_sessions_owner_idx on public.chat_sessions (owner_user_id);

create table public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.chat_sessions (id) on delete cascade,
  role          chat_role not null,
  content       text not null,
  in_tokens     int,
  out_tokens    int,
  created_at    timestamptz not null default now()
);
create index chat_messages_session_idx on public.chat_messages (session_id);

-- =====================================================================
-- comments (Phase B+ but schema lands now to keep migrations linear)
-- =====================================================================
create table public.comments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  target_type     text not null check (target_type in ('finding', 'task', 'memory')),
  target_id       uuid not null,
  author_user_id  uuid not null references auth.users (id) on delete restrict,
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_type, target_id);
create index comments_workspace_idx on public.comments (workspace_id);

-- =====================================================================
-- activity log
-- =====================================================================
create table public.activity_log (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  actor_user_id   uuid not null references auth.users (id) on delete restrict,
  action          text not null,
  target_type     text,
  target_id       uuid,
  payload         jsonb,
  created_at      timestamptz not null default now()
);
create index activity_log_workspace_idx on public.activity_log (workspace_id, created_at desc);

-- =====================================================================
-- updated_at auto-touch
-- =====================================================================
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_touch       before update on public.profiles       for each row execute function public.touch_updated_at();
create trigger workspaces_touch     before update on public.workspaces     for each row execute function public.touch_updated_at();
create trigger projects_touch       before update on public.projects       for each row execute function public.touch_updated_at();
create trigger comments_touch       before update on public.comments       for each row execute function public.touch_updated_at();
