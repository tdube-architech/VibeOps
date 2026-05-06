-- Phase B5: Stripe-backed Pro tier.
-- Workspaces track stripe_customer_id, current subscription, seats, and trial.
-- Free → Pro transitions arrive via stripe-webhook Edge Function.

create type subscription_status as enum (
  'none', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete'
);

alter table public.workspaces
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    subscription_status not null default 'none',
  add column if not exists member_seats           int not null default 5,
  add column if not exists current_period_end     timestamptz;

create index if not exists workspaces_stripe_customer_idx
  on public.workspaces (stripe_customer_id) where stripe_customer_id is not null;

create index if not exists workspaces_stripe_sub_idx
  on public.workspaces (stripe_subscription_id) where stripe_subscription_id is not null;

-- =====================================================================
-- start_trial: 7-day Pro trial. Triggered when free user hits a limit.
-- Idempotent: doesn't restart if already past or in a trial.
-- =====================================================================
create or replace function public.start_trial(ws_id uuid) returns public.workspaces as $$
declare
  ws public.workspaces;
begin
  if not public.is_workspace_owner(ws_id) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0011';
  end if;
  select * into ws from public.workspaces where id = ws_id;
  if ws.trial_ends_at is not null then
    raise exception 'TRIAL_ALREADY_USED' using errcode = 'P0016';
  end if;
  update public.workspaces
    set plan = 'pro',
        trial_ends_at = now() + interval '7 days',
        subscription_status = 'trialing',
        member_seats = 1000  -- effectively unlimited during trial
  where id = ws_id
  returning * into ws;
  insert into public.activity_log (workspace_id, actor_user_id, action, target_type, target_id, payload)
  values (ws_id, auth.uid(), 'workspace.trial_started', 'workspace', ws_id,
          jsonb_build_object('ends_at', ws.trial_ends_at));
  return ws;
end;
$$ language plpgsql security definer;
grant execute on function public.start_trial(uuid) to authenticated;

-- =====================================================================
-- Replace 5-member quota check to honor member_seats + trial expiry
-- =====================================================================
create or replace function public.check_member_limit() returns trigger as $$
declare
  current_count int;
  ws public.workspaces;
begin
  select * into ws from public.workspaces where id = new.workspace_id;
  if ws.plan = 'pro' then
    -- Trial expired? Drop back to free 5-seat cap.
    if ws.trial_ends_at is not null and ws.trial_ends_at < now()
       and ws.subscription_status not in ('active', 'past_due') then
      ws.plan := 'free';
      ws.member_seats := 5;
    end if;
  end if;
  if ws.plan = 'free' or ws.member_seats <= 5 then
    select count(*) into current_count
    from public.workspace_members
    where workspace_id = new.workspace_id;
    if current_count >= coalesce(ws.member_seats, 5) then
      raise exception 'WORKSPACE_MEMBER_LIMIT'
        using errcode = 'P0001',
              hint = 'Free workspaces are capped at 5 members. Upgrade to Pro or start a 7-day trial.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- list workspace billing snapshot for the Settings page
-- =====================================================================
create or replace function public.workspace_billing(ws_id uuid)
returns table (
  workspace_id uuid,
  plan plan_tier,
  subscription_status subscription_status,
  member_seats int,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  member_count int,
  is_owner boolean
) as $$
  select w.id,
         w.plan,
         w.subscription_status,
         w.member_seats,
         w.trial_ends_at,
         w.current_period_end,
         (select count(*)::int from public.workspace_members wm where wm.workspace_id = w.id),
         (w.owner_id = auth.uid())
  from public.workspaces w
  where w.id = ws_id and public.is_workspace_member(ws_id);
$$ language sql stable security definer;
grant execute on function public.workspace_billing(uuid) to authenticated;
