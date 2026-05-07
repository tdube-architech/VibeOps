-- Phase scan-sync: mirror local project scan results to Supabase so workspace
-- teammates see the latest scan output without re-running it locally.
--
-- Local SQLite remains the source of truth for scan execution; this just
-- mirrors the completed result body. See src/main/db/schema.ts for the local
-- shapes (project_scans / project_files / project_env_vars).

-- =====================================================================
-- project_scans
-- =====================================================================
create table public.project_scans (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects   (id) on delete cascade,
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  started_at        timestamptz,
  completed_at      timestamptz,
  primary_stack     text,
  file_count        int,
  env_var_count     int,
  summary           jsonb,                                    -- detection result + warnings + status
  scanned_by        uuid references auth.users (id),
  created_at        timestamptz not null default now()
);
create index project_scans_project_idx
  on public.project_scans (project_id, completed_at desc);
-- Idempotency: republishing the same local scan replaces the previous mirror.
-- We dedupe on (project_id, completed_at) since local scan IDs (cuid) don't
-- map to the cloud row IDs and completed_at is unique-enough per project.
create unique index project_scans_project_completed_uidx
  on public.project_scans (project_id, completed_at)
  where completed_at is not null;

-- =====================================================================
-- project_scan_files (mirror of local project_files for the latest scan)
-- =====================================================================
create table public.project_scan_files (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references public.project_scans (id) on delete cascade,
  path              text,
  language          text,                                     -- maps to local fileType
  size_bytes        int,
  sha256            text,                                     -- maps to local hash
  role              text                                      -- e.g. 'source' | 'config' | 'test' | importance hint
);
create index project_scan_files_scan_idx on public.project_scan_files (scan_id);

-- =====================================================================
-- project_scan_env_vars
-- =====================================================================
create table public.project_scan_env_vars (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references public.project_scans (id) on delete cascade,
  name              text,
  file              text,                                     -- maps to local filename
  line              int                                       -- optional; null when not extracted
);
create index project_scan_env_vars_scan_idx on public.project_scan_env_vars (scan_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.project_scans         enable row level security;
alter table public.project_scan_files    enable row level security;
alter table public.project_scan_env_vars enable row level security;

create policy ps_select on public.project_scans for select
  using (public.is_workspace_member(workspace_id));
create policy ps_insert on public.project_scans for insert
  with check (public.is_workspace_member(workspace_id));
create policy ps_update on public.project_scans for update
  using (public.is_workspace_member(workspace_id));
create policy ps_delete on public.project_scans for delete
  using (public.is_workspace_member(workspace_id));

create policy psf_select on public.project_scan_files for select
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psf_insert on public.project_scan_files for insert
  with check (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psf_update on public.project_scan_files for update
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psf_delete on public.project_scan_files for delete
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));

create policy psev_select on public.project_scan_env_vars for select
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psev_insert on public.project_scan_env_vars for insert
  with check (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psev_update on public.project_scan_env_vars for update
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));
create policy psev_delete on public.project_scan_env_vars for delete
  using (exists (
    select 1 from public.project_scans s
    where s.id = scan_id and public.is_workspace_member(s.workspace_id)
  ));

-- =====================================================================
-- Realtime publication + REPLICA IDENTITY FULL (consistent with 0025).
-- Filtered subscriptions on non-PK columns require REPLICA IDENTITY FULL,
-- otherwise INSERT events get dropped server-side.
-- =====================================================================
alter publication supabase_realtime add table public.project_scans;
alter publication supabase_realtime add table public.project_scan_files;
alter publication supabase_realtime add table public.project_scan_env_vars;

alter table public.project_scans         replica identity full;
alter table public.project_scan_files    replica identity full;
alter table public.project_scan_env_vars replica identity full;
