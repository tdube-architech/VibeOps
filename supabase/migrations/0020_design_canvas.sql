-- Phase D-canvas: collaborative design canvas per project.
-- Multiple named canvases per project (e.g. "architecture", "data flow",
-- "onboarding"). Real-time collab via postgres_changes broadcasts.

create table public.project_canvases (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects (id) on delete cascade,
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null,
  description     text,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index project_canvases_project_idx on public.project_canvases (project_id, updated_at desc);

create table public.canvas_nodes (
  id              uuid primary key default gen_random_uuid(),
  canvas_id       uuid not null references public.project_canvases (id) on delete cascade,
  node_type       text not null,             -- 'service' | 'database' | 'frontend' | 'queue' | 'external' | 'note' | etc.
  position_x      double precision not null default 0,
  position_y      double precision not null default 0,
  width           double precision,
  height          double precision,
  data            jsonb not null default '{}'::jsonb,  -- label, color, icon, fields, etc.
  created_by      uuid references auth.users (id),
  updated_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index canvas_nodes_canvas_idx on public.canvas_nodes (canvas_id);

create table public.canvas_edges (
  id              uuid primary key default gen_random_uuid(),
  canvas_id       uuid not null references public.project_canvases (id) on delete cascade,
  source_node_id  uuid not null references public.canvas_nodes (id) on delete cascade,
  target_node_id  uuid not null references public.canvas_nodes (id) on delete cascade,
  source_handle   text,
  target_handle   text,
  label           text,
  data            jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);
create index canvas_edges_canvas_idx on public.canvas_edges (canvas_id);

alter table public.project_canvases enable row level security;
alter table public.canvas_nodes     enable row level security;
alter table public.canvas_edges     enable row level security;

create policy pc_select on public.project_canvases for select
  using (public.is_project_visible(project_id));
create policy pc_insert on public.project_canvases for insert
  with check (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id));
create policy pc_update on public.project_canvases for update
  using (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id));
create policy pc_delete on public.project_canvases for delete
  using (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id));

create policy cn_select on public.canvas_nodes for select
  using (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id and public.is_project_visible(c.project_id)
  ));
create policy cn_insert on public.canvas_nodes for insert
  with check (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id
      and public.is_project_visible(c.project_id)
      and public.is_workspace_writer(c.workspace_id)
  ));
create policy cn_update on public.canvas_nodes for update
  using (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id
      and public.is_project_visible(c.project_id)
      and public.is_workspace_writer(c.workspace_id)
  ));
create policy cn_delete on public.canvas_nodes for delete
  using (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id
      and public.is_project_visible(c.project_id)
      and public.is_workspace_writer(c.workspace_id)
  ));

create policy ce_select on public.canvas_edges for select
  using (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id and public.is_project_visible(c.project_id)
  ));
create policy ce_insert on public.canvas_edges for insert
  with check (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id
      and public.is_project_visible(c.project_id)
      and public.is_workspace_writer(c.workspace_id)
  ));
create policy ce_delete on public.canvas_edges for delete
  using (exists (
    select 1 from public.project_canvases c
    where c.id = canvas_id
      and public.is_project_visible(c.project_id)
      and public.is_workspace_writer(c.workspace_id)
  ));

alter publication supabase_realtime add table public.project_canvases;
alter publication supabase_realtime add table public.canvas_nodes;
alter publication supabase_realtime add table public.canvas_edges;
