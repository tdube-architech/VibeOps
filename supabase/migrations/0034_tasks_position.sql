-- Tasks ordering: per-status sortable position. Renderer sets via drag-drop.
alter table public.tasks
  add column if not exists position double precision;

create index if not exists tasks_status_position_idx
  on public.tasks (status, position)
  where deleted_at is null;

-- Backfill existing rows: row_number * 1000 within (workspace_id, status).
update public.tasks t
set position = sub.rn * 1000.0
from (
  select id, row_number() over (
    partition by workspace_id, status
    order by created_at desc
  ) as rn
  from public.tasks
  where position is null
) sub
where t.id = sub.id;

-- Extend update_task_versioned to write position.
create or replace function public.update_task_versioned(
  task_id uuid,
  expected_version int,
  patch jsonb
) returns public.tasks
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.tasks;
  updated_row public.tasks;
  next_status text;
begin
  select * into current_row from public.tasks where id = task_id;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0013';
  end if;
  if current_row.version <> expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0012',
      hint = 'Row was modified by another user. Refresh and retry.';
  end if;

  next_status := coalesce(patch->>'status', current_row.status::text);

  update public.tasks
  set title             = coalesce(patch->>'title', title),
      description       = case when patch ? 'description' then patch->>'description' else description end,
      priority          = coalesce((patch->>'priority')::task_priority, priority),
      status            = next_status::task_status,
      assignee_user_id  = case
                            when patch ? 'assignee_user_id' then nullif(patch->>'assignee_user_id', '')::uuid
                            else assignee_user_id
                          end,
      related_files     = case
                            when patch ? 'related_files' then array(select jsonb_array_elements_text(patch->'related_files'))
                            else related_files
                          end,
      suggested_prompt  = case when patch ? 'suggested_prompt' then patch->>'suggested_prompt' else suggested_prompt end,
      position          = case when patch ? 'position' then (patch->>'position')::double precision else position end,
      completed_at      = case
                            when next_status = 'done' and current_row.status::text <> 'done' then now()
                            when next_status <> 'done' and current_row.status::text = 'done' then null
                            else completed_at
                          end
  where id = task_id
  returning * into updated_row;

  return updated_row;
end;
$$;
grant execute on function public.update_task_versioned(uuid, int, jsonb) to authenticated;
