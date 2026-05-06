-- Audit run locks: prevent two users from triggering audits on the same
-- cloud project simultaneously. 10-minute hard timeout reaps stuck runs.

-- =====================================================================
-- BEFORE INSERT trigger: reject if a running audit exists
-- =====================================================================
create or replace function public.check_audit_lock() returns trigger as $$
declare
  conflicting record;
begin
  if new.status <> 'running' then
    return new;
  end if;

  select id, run_by_user_id, started_at
  into conflicting
  from public.audit_runs
  where project_id = new.project_id
    and status = 'running'
    and started_at > now() - interval '10 minutes'
  limit 1;

  if found then
    raise exception 'AUDIT_IN_FLIGHT'
      using errcode = 'P0014',
            hint = 'Another audit is already running on this project.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists audit_runs_lock_check on public.audit_runs;
create trigger audit_runs_lock_check
  before insert on public.audit_runs
  for each row execute function public.check_audit_lock();

-- =====================================================================
-- claim_audit_run: atomic INSERT under SECURITY DEFINER so the lock
-- check runs cleanly + returns server uuid for the renderer to track.
-- =====================================================================
create or replace function public.claim_audit_run(
  ws_id uuid,
  proj_id uuid,
  audit_kind audit_kind default 'full'
) returns public.audit_runs as $$
declare
  inserted_row public.audit_runs;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;
  if not public.is_workspace_writer(ws_id) then
    raise exception 'WORKSPACE_WRITER_REQUIRED' using errcode = 'P0008';
  end if;

  insert into public.audit_runs (
    project_id, workspace_id, audit_type, status,
    run_by_user_id, started_at
  )
  values (proj_id, ws_id, audit_kind, 'running', auth.uid(), now())
  returning * into inserted_row;

  return inserted_row;
end;
$$ language plpgsql security definer;
grant execute on function public.claim_audit_run(uuid, uuid, audit_kind) to authenticated;

-- =====================================================================
-- finalize_audit_run: update an existing running row with results.
-- Bypasses the lock check via UPDATE path.
-- =====================================================================
create or replace function public.finalize_audit_run(
  run_id uuid,
  final_status audit_status,
  final_score int default null,
  final_risk_level text default null,
  final_summary text default null,
  final_recommended_next_action text default null,
  final_provider text default null,
  final_model text default null,
  final_error_message text default null
) returns public.audit_runs as $$
declare
  updated_row public.audit_runs;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  update public.audit_runs
  set status                  = final_status,
      score                   = coalesce(final_score, score),
      risk_level              = coalesce(final_risk_level, risk_level),
      summary                 = coalesce(final_summary, summary),
      recommended_next_action = coalesce(final_recommended_next_action, recommended_next_action),
      provider                = coalesce(final_provider, provider),
      model                   = coalesce(final_model, model),
      error_message           = final_error_message,
      completed_at            = case when final_status in ('completed', 'failed', 'queued')
                                     then now() else completed_at end
  where id = run_id and run_by_user_id = auth.uid()
  returning * into updated_row;

  if not found then
    raise exception 'AUDIT_RUN_NOT_FOUND_OR_FORBIDDEN' using errcode = 'P0015';
  end if;
  return updated_row;
end;
$$ language plpgsql security definer;
grant execute on function public.finalize_audit_run(
  uuid, audit_status, int, text, text, text, text, text, text
) to authenticated;

-- =====================================================================
-- Reaper: mark running > 10 min as failed
-- =====================================================================
create or replace function public.reap_stuck_audits() returns void as $$
begin
  update public.audit_runs
  set status = 'failed',
      error_message = coalesce(error_message, 'Timed out after 10 minutes'),
      completed_at = now()
  where status = 'running'
    and started_at < now() - interval '10 minutes';
end;
$$ language plpgsql security definer;

select cron.schedule('vibeops-reap-audits', '*/2 * * * *',
  $$select public.reap_stuck_audits();$$);
