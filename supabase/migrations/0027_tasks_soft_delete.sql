-- Soft-delete tasks. Trash retention = 30 days; edge function purges older.
alter table public.tasks
  add column if not exists deleted_at timestamptz;

create index if not exists tasks_deleted_idx
  on public.tasks (deleted_at)
  where deleted_at is not null;

-- Hide deleted rows from default reads.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (
    public.is_project_visible(project_id)
    and deleted_at is null
  );

-- Separate policy lets a user read their own trash (workspace-writers see ws-trash).
drop policy if exists tasks_select_trash on public.tasks;
create policy tasks_select_trash on public.tasks for select
  using (
    deleted_at is not null
    and public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
  );

-- Tighten existing update/delete policies to exclude trashed rows.
-- Soft-delete + restore + empty-trash all go through the RPCs above.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and deleted_at is null
  )
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and deleted_at is null
  );

-- Soft-delete RPC.
create or replace function public.soft_delete_task(task_id uuid)
returns public.tasks as $$
declare task_row public.tasks;
begin
  update public.tasks
    set deleted_at = now()
    where id = task_id and deleted_at is null
    returning * into task_row;
  if not found then
    raise exception 'TASK_NOT_FOUND_OR_ALREADY_DELETED' using errcode = 'P0013';
  end if;
  return task_row;
end;
$$ language plpgsql security invoker;
grant execute on function public.soft_delete_task(uuid) to authenticated;

-- Restore RPC.
create or replace function public.restore_task(task_id uuid)
returns public.tasks as $$
declare task_row public.tasks;
begin
  select * into task_row from public.tasks where id = task_id;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0013';
  end if;
  if not public.is_workspace_writer(task_row.workspace_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if task_row.deleted_at is null then
    raise exception 'TASK_NOT_DELETED' using errcode = 'P0013';
  end if;
  update public.tasks
    set deleted_at = null
    where id = task_id
    returning * into task_row;
  return task_row;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
grant execute on function public.restore_task(uuid) to authenticated;

-- Empty-trash for the active workspace (caller must be writer).
create or replace function public.empty_trash(ws_id uuid)
returns int as $$
declare deleted_count int;
begin
  if not public.is_workspace_writer(ws_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  delete from public.tasks
    where workspace_id = ws_id
      and deleted_at is not null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
grant execute on function public.empty_trash(uuid) to authenticated;
