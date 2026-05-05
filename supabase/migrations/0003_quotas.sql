-- Quota enforcement for free vs pro plans.
-- Free workspace caps:
--   * 5 members per workspace
--   * 1 owned workspace per user
-- Pro: unlimited.

-- =====================================================================
-- enforce 5-member cap on free workspaces
-- =====================================================================
create or replace function public.check_member_limit() returns trigger as $$
declare
  current_count int;
  ws_plan plan_tier;
begin
  select plan into ws_plan from public.workspaces where id = new.workspace_id;
  if ws_plan = 'free' then
    select count(*) into current_count
    from public.workspace_members
    where workspace_id = new.workspace_id;
    if current_count >= 5 then
      raise exception 'WORKSPACE_MEMBER_LIMIT'
        using errcode = 'P0001',
              hint = 'Free workspaces are capped at 5 members. Upgrade to Pro to invite more.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger workspace_members_limit
  before insert on public.workspace_members
  for each row execute function public.check_member_limit();

-- =====================================================================
-- enforce 1 owned workspace per free user
-- =====================================================================
create or replace function public.check_owned_workspace_limit() returns trigger as $$
declare
  owned_count int;
  user_has_pro boolean;
begin
  -- A user is "pro" if they own any pro workspace OR they're explicitly upgraded
  -- (placeholder: tied to workspaces.plan; richer billing model lives in Phase D)
  select exists (
    select 1 from public.workspaces
    where owner_id = new.owner_id and plan = 'pro'
  ) into user_has_pro;

  if not user_has_pro and new.plan = 'free' then
    select count(*) into owned_count
    from public.workspaces
    where owner_id = new.owner_id;
    if owned_count >= 1 then
      raise exception 'WORKSPACE_OWNED_LIMIT'
        using errcode = 'P0002',
              hint = 'Free users may own one workspace. Upgrade to Pro to create more.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger workspaces_owned_limit
  before insert on public.workspaces
  for each row execute function public.check_owned_workspace_limit();

-- =====================================================================
-- audit retention pruner (free tier: 90 days)
-- =====================================================================
create or replace function public.prune_audit_history() returns void as $$
begin
  delete from public.audit_runs r
  using public.workspaces w
  where r.workspace_id = w.id
    and w.plan = 'free'
    and r.completed_at < now() - interval '90 days';
end;
$$ language plpgsql security definer;

-- =====================================================================
-- activity log retention (free tier: 30 days)
-- =====================================================================
create or replace function public.prune_activity_log() returns void as $$
begin
  delete from public.activity_log al
  using public.workspaces w
  where al.workspace_id = w.id
    and w.plan = 'free'
    and al.created_at < now() - interval '30 days';
end;
$$ language plpgsql security definer;

-- =====================================================================
-- nightly cron: 03:00 UTC
-- =====================================================================
select cron.schedule('vibeops-prune-audits', '0 3 * * *', $$select public.prune_audit_history();$$);
select cron.schedule('vibeops-prune-activity', '15 3 * * *', $$select public.prune_activity_log();$$);
