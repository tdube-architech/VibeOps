-- Phase D5: live awareness of teammate work.
-- project_dirty_files: per-(project,user,machine,file) dirty state. Updated
-- by chokidar in the renderer. No content stored — just hash + timestamp.
-- project_commits: a feed of local-commit and push events so teammates see
-- "Bob pushed 3 commits" in real time.

create table public.project_dirty_files (
  project_id    uuid not null references public.projects (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  machine_id    text not null,
  file_path     text not null,
  hash          text not null,
  size_bytes    int,
  modified_at   timestamptz not null default now(),
  primary key (project_id, user_id, machine_id, file_path)
);
create index project_dirty_files_project_idx on public.project_dirty_files (project_id, modified_at desc);
create index project_dirty_files_user_idx    on public.project_dirty_files (user_id, modified_at desc);

create type project_commit_kind as enum ('local', 'push');

create table public.project_commits (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  sha           text not null,
  short_sha     text,
  message       text,
  branch        text,
  kind          project_commit_kind not null default 'local',
  ts            timestamptz not null default now(),
  unique (project_id, sha, kind)
);
create index project_commits_project_idx on public.project_commits (project_id, ts desc);

alter table public.project_dirty_files enable row level security;
alter table public.project_commits     enable row level security;

create policy pdf_select on public.project_dirty_files for select
  using (public.is_project_visible(project_id));
create policy pdf_self_insert on public.project_dirty_files for insert
  with check (user_id = auth.uid() and public.is_project_visible(project_id));
create policy pdf_self_update on public.project_dirty_files for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pdf_self_delete on public.project_dirty_files for delete
  using (user_id = auth.uid());

create policy pc_select on public.project_commits for select
  using (public.is_project_visible(project_id));
create policy pc_self_insert on public.project_commits for insert
  with check (user_id = auth.uid() and public.is_project_visible(project_id));

alter publication supabase_realtime add table public.project_dirty_files;
alter publication supabase_realtime add table public.project_commits;

-- =====================================================================
-- Reaper: drop dirty rows that haven't been touched in 24h. They almost
-- certainly correspond to a long-closed VibeOps that never got the chance
-- to clean up its own state.
-- =====================================================================
create or replace function public.reap_stale_dirty_files() returns void as $$
begin
  delete from public.project_dirty_files
   where modified_at < now() - interval '24 hours';
end;
$$ language plpgsql security definer;

select cron.schedule('vibeops-reap-dirty-files', '17 * * * *',
  $$select public.reap_stale_dirty_files();$$);
