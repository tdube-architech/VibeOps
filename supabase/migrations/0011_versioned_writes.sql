-- Optimistic concurrency RPCs. Renderer reads version with the row, sends it
-- back on update. Server compares; raises CONFLICT (P0012) on mismatch so
-- client can refetch + retry.

-- =====================================================================
-- update_task_versioned
-- =====================================================================
create or replace function public.update_task_versioned(
  task_id uuid,
  expected_version int,
  patch jsonb
) returns public.tasks as $$
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
      completed_at      = case
                            when next_status = 'done' and current_row.status::text <> 'done' then now()
                            when next_status <> 'done' and current_row.status::text = 'done' then null
                            else completed_at
                          end
  where id = task_id
  returning * into updated_row;

  return updated_row;
end;
$$ language plpgsql security definer;
grant execute on function public.update_task_versioned(uuid, int, jsonb) to authenticated;

-- =====================================================================
-- update_finding_status_versioned
-- =====================================================================
create or replace function public.update_finding_status_versioned(
  finding_id uuid,
  expected_version int,
  new_status finding_status
) returns public.audit_findings as $$
declare
  current_row public.audit_findings;
  updated_row public.audit_findings;
begin
  select * into current_row from public.audit_findings where id = finding_id;
  if not found then
    raise exception 'FINDING_NOT_FOUND' using errcode = 'P0013';
  end if;
  if current_row.version <> expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0012',
      hint = 'Finding was modified by another user. Refresh and retry.';
  end if;

  update public.audit_findings
  set status               = new_status,
      resolved_at          = case
                               when new_status in ('fixed', 'wont-fix') then now()
                               else null
                             end,
      resolved_by_user_id  = case
                               when new_status in ('fixed', 'wont-fix') then auth.uid()
                               else null
                             end
  where id = finding_id
  returning * into updated_row;

  return updated_row;
end;
$$ language plpgsql security definer;
grant execute on function public.update_finding_status_versioned(uuid, int, finding_status) to authenticated;

-- =====================================================================
-- update_project_versioned (rename/status/tags)
-- =====================================================================
create or replace function public.update_project_versioned(
  project_id uuid,
  expected_version int,
  patch jsonb
) returns public.projects as $$
declare
  current_row public.projects;
  updated_row public.projects;
begin
  select * into current_row from public.projects where id = project_id;
  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0013';
  end if;
  if current_row.version <> expected_version then
    raise exception 'VERSION_CONFLICT' using errcode = 'P0012',
      hint = 'Project was modified by another user. Refresh and retry.';
  end if;

  update public.projects
  set name        = coalesce(patch->>'name', name),
      description = case when patch ? 'description' then patch->>'description' else description end,
      category    = case when patch ? 'category' then patch->>'category' else category end,
      status      = coalesce((patch->>'status')::project_status, status),
      tags        = case
                      when patch ? 'tags' then array(select jsonb_array_elements_text(patch->'tags'))
                      else tags
                    end,
      repo_url    = case when patch ? 'repo_url' then patch->>'repo_url' else repo_url end
  where id = project_id
  returning * into updated_row;

  return updated_row;
end;
$$ language plpgsql security definer;
grant execute on function public.update_project_versioned(uuid, int, jsonb) to authenticated;
