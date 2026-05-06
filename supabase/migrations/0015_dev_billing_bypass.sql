-- Dev-only bypass: workspace owner can flip their workspace to Pro without
-- Stripe wiring. Lets you exercise multi-seat invites + Pro UI before
-- Stripe is set up. Remove or gate behind an env check before launch.

create or replace function public.dev_grant_pro(ws_id uuid, seats int default 1000)
returns public.workspaces as $$
declare
  ws public.workspaces;
begin
  if not public.is_workspace_owner(ws_id) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0011';
  end if;
  update public.workspaces
    set plan = 'pro',
        subscription_status = 'active',
        member_seats = greatest(seats, 5),
        trial_ends_at = null,
        current_period_end = now() + interval '30 days'
  where id = ws_id
  returning * into ws;

  insert into public.activity_log (workspace_id, actor_user_id, action, target_type, target_id, payload)
  values (ws_id, auth.uid(), 'workspace.dev_pro_granted', 'workspace', ws_id,
          jsonb_build_object('seats', greatest(seats, 5)));
  return ws;
end;
$$ language plpgsql security definer;
grant execute on function public.dev_grant_pro(uuid, int) to authenticated;

create or replace function public.dev_revoke_pro(ws_id uuid) returns public.workspaces as $$
declare
  ws public.workspaces;
begin
  if not public.is_workspace_owner(ws_id) then
    raise exception 'OWNER_REQUIRED' using errcode = 'P0011';
  end if;
  update public.workspaces
    set plan = 'free',
        subscription_status = 'none',
        member_seats = 5,
        trial_ends_at = null,
        current_period_end = null
  where id = ws_id
  returning * into ws;
  return ws;
end;
$$ language plpgsql security definer;
grant execute on function public.dev_revoke_pro(uuid) to authenticated;
