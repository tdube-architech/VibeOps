-- Add source_signature for findings→tasks dedupe across audit runs.
alter table public.tasks add column if not exists source_signature text;

create index if not exists idx_tasks_project_source_signature
  on public.tasks (project_id, source_signature)
  where deleted_at is null;
