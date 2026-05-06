-- Phase B2: optimistic concurrency stamps + per-audit git commit anchor.
-- version int default 1, incremented on every UPDATE via trigger so
-- writes can WHERE id=? AND version=? to detect conflicts.

alter table public.audit_runs       add column if not exists version int not null default 1;
alter table public.audit_runs       add column if not exists git_commit_sha text;
alter table public.audit_findings   add column if not exists version int not null default 1;
alter table public.tasks            add column if not exists version int not null default 1;
alter table public.memory_versions  add column if not exists version_stamp int not null default 1;
alter table public.projects         add column if not exists version int not null default 1;

create or replace function public.bump_version() returns trigger as $$
begin
  if (new.version is not distinct from old.version) then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.bump_version_stamp() returns trigger as $$
begin
  if (new.version_stamp is not distinct from old.version_stamp) then
    new.version_stamp := old.version_stamp + 1;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_bump_version       on public.projects;
drop trigger if exists audit_runs_bump_version     on public.audit_runs;
drop trigger if exists audit_findings_bump_version on public.audit_findings;
drop trigger if exists tasks_bump_version          on public.tasks;
drop trigger if exists memory_versions_bump_stamp  on public.memory_versions;

create trigger projects_bump_version
  before update on public.projects
  for each row execute function public.bump_version();

create trigger audit_runs_bump_version
  before update on public.audit_runs
  for each row execute function public.bump_version();

create trigger audit_findings_bump_version
  before update on public.audit_findings
  for each row execute function public.bump_version();

create trigger tasks_bump_version
  before update on public.tasks
  for each row execute function public.bump_version();

create trigger memory_versions_bump_stamp
  before update on public.memory_versions
  for each row execute function public.bump_version_stamp();

-- Tighten audit + finding RLS to honor project visibility (was workspace-member only).
drop policy if exists ar_select on public.audit_runs;
create policy ar_select on public.audit_runs for select
  using (public.is_project_visible(project_id));

drop policy if exists af_select on public.audit_findings;
create policy af_select on public.audit_findings for select
  using (public.is_project_visible(project_id));

-- Allow workspace members to insert audit_runs only for projects they can see.
drop policy if exists ar_insert on public.audit_runs;
create policy ar_insert on public.audit_runs for insert
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and run_by_user_id = auth.uid()
  );

drop policy if exists af_insert on public.audit_findings;
create policy af_insert on public.audit_findings for insert
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
  );

-- Realtime broadcasts so connected clients see new audits + findings + tasks.
alter publication supabase_realtime add table public.audit_runs;
alter publication supabase_realtime add table public.audit_findings;
alter publication supabase_realtime add table public.tasks;
