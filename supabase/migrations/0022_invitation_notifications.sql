-- Real-time invitation notifications.
-- - When an invite is created against an email that already has a Supabase
--   user, drop a notification into their bell so they see it immediately.
-- - When the invitee accepts or declines, notify the inviter.
-- - Add `declined_at` so an invite can be rejected without consuming.

alter table public.invitations
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references auth.users (id);

-- =====================================================================
-- on insert: notify the invitee if they already have a Supabase profile
-- =====================================================================
create or replace function public.notify_invitee_of_invite() returns trigger as $$
declare
  invitee_user_id uuid;
  ws_name         text;
  inviter_email   text;
begin
  select user_id into invitee_user_id
  from public.profiles
  where lower(email) = lower(new.email)
  limit 1;

  if invitee_user_id is null then return new; end if;

  select name into ws_name from public.workspaces where id = new.workspace_id;
  select email into inviter_email from public.profiles where user_id = new.invited_by;

  insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
  values (
    invitee_user_id, new.workspace_id,
    'workspace.invitation_pending',
    coalesce(inviter_email, 'Someone') || ' invited you to ' || coalesce(ws_name, 'a workspace'),
    'Role: ' || new.role || '. Open the bell to accept or decline.',
    null,
    jsonb_build_object(
      'invitation_id', new.id,
      'workspace_id', new.workspace_id,
      'workspace_name', ws_name,
      'role', new.role,
      'invited_by', new.invited_by,
      'inviter_email', inviter_email,
      'token', new.token,
      'expires_at', new.expires_at
    )
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists invitations_notify_invitee on public.invitations;
create trigger invitations_notify_invitee
  after insert on public.invitations
  for each row execute function public.notify_invitee_of_invite();

-- =====================================================================
-- accept_invitation: now also notifies the inviter
-- =====================================================================
create or replace function public.accept_invitation(invite_token text)
returns public.workspace_members as $$
declare
  inv public.invitations;
  caller_email text;
  ws_name text;
  invitee_email text;
  new_member public.workspace_members;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  select * into inv from public.invitations
  where token = invite_token and accepted_at is null and declined_at is null
  limit 1;

  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0004';
  end if;
  if inv.expires_at < now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0005';
  end if;
  if lower(inv.email) <> lower(caller_email) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0006',
      hint = 'This invitation was sent to a different email.';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role
  returning * into new_member;

  update public.invitations
  set accepted_at = now(), accepted_by = auth.uid()
  where id = inv.id;

  insert into public.activity_log (workspace_id, actor_user_id, action, target_type, target_id, payload)
  values (inv.workspace_id, auth.uid(), 'invitation.accepted', 'workspace_member', auth.uid(),
          jsonb_build_object('role', inv.role));

  -- Mark any pending invitation_pending notifications as read so the bell clears.
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and type = 'workspace.invitation_pending'
    and (payload->>'invitation_id')::uuid = inv.id;

  -- Notify inviter
  select name into ws_name from public.workspaces where id = inv.workspace_id;
  select email into invitee_email from public.profiles where user_id = auth.uid();
  insert into public.notifications (user_id, workspace_id, type, title, body, payload)
  values (
    inv.invited_by, inv.workspace_id,
    'workspace.invitation_accepted',
    coalesce(invitee_email, 'Someone') || ' accepted your invite to ' || coalesce(ws_name, 'workspace'),
    'They are now ' || inv.role || '.',
    jsonb_build_object('invitation_id', inv.id, 'invitee_id', auth.uid(), 'invitee_email', invitee_email, 'role', inv.role)
  );

  return new_member;
end;
$$ language plpgsql security definer;

-- =====================================================================
-- decline_invitation: same email-match guard, marks declined, notifies inviter
-- =====================================================================
create or replace function public.decline_invitation(invite_token text)
returns void as $$
declare
  inv public.invitations;
  caller_email text;
  ws_name text;
  invitee_email text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  select * into inv from public.invitations
  where token = invite_token and accepted_at is null and declined_at is null
  limit 1;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0004';
  end if;
  if lower(inv.email) <> lower(caller_email) then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0006';
  end if;

  update public.invitations
  set declined_at = now(), declined_by = auth.uid()
  where id = inv.id;

  -- Clear the pending notification for this invitee.
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and type = 'workspace.invitation_pending'
    and (payload->>'invitation_id')::uuid = inv.id;

  -- Notify inviter.
  select name into ws_name from public.workspaces where id = inv.workspace_id;
  select email into invitee_email from public.profiles where user_id = auth.uid();
  insert into public.notifications (user_id, workspace_id, type, title, body, payload)
  values (
    inv.invited_by, inv.workspace_id,
    'workspace.invitation_declined',
    coalesce(invitee_email, 'Someone') || ' declined your invite to ' || coalesce(ws_name, 'workspace'),
    null,
    jsonb_build_object('invitation_id', inv.id, 'invitee_email', invitee_email)
  );
end;
$$ language plpgsql security definer;

grant execute on function public.decline_invitation(text) to authenticated;

-- Notifications are already in the Realtime publication (0007), so the
-- invitee gets the row pushed to them as soon as the trigger fires.
