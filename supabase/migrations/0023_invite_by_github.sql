-- Looser invite matching:
-- 1. invite_member now also accepts a GitHub username (and rejects targets
--    that don't have a VibeOps profile yet).
-- 2. accept_invitation matches against any verified email on the caller's
--    auth.identities OR their stored github_username, not just the literal
--    auth.users.email.

alter table public.invitations
  add column if not exists invitee_github_username text,
  alter column email drop not null;

-- Helper that returns the set of email/identity strings the caller can
-- legitimately claim. Used by accept_invitation to verify ownership.
create or replace function public.caller_email_matches(target text) returns boolean as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = lower(target)
  )
  or exists (
    select 1 from auth.identities i
    where i.user_id = auth.uid()
      and (
        lower(coalesce(i.identity_data->>'email', '')) = lower(target)
        or position(lower(target) in lower(coalesce(i.identity_data->>'emails', ''))) > 0
      )
  )
  or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and lower(p.email) = lower(target)
  );
$$ language sql stable security definer;

-- =====================================================================
-- invite_member_v2: accept email OR github_username; require target user
-- to already have a VibeOps profile before issuing the invite.
-- =====================================================================
create or replace function public.invite_member_v2(
  ws_id              uuid,
  invitee_email      text default null,
  invitee_github     text default null,
  invitee_role       member_role default 'editor'
) returns public.invitations as $$
declare
  token_value     text := encode(gen_random_bytes(24), 'base64');
  resolved_email  text := null;
  resolved_handle text := null;
  target_user_id  uuid := null;
  inv             public.invitations;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;
  if not public.is_workspace_writer(ws_id) then
    raise exception 'WORKSPACE_WRITER_REQUIRED' using errcode = 'P0008';
  end if;
  if invitee_email is null and invitee_github is null then
    raise exception 'INVITE_TARGET_REQUIRED' using errcode = 'P0009',
      hint = 'Provide an email or a github username.';
  end if;

  if invitee_github is not null then
    resolved_handle := lower(trim(invitee_github));
    select g.user_id, p.email
      into target_user_id, resolved_email
      from public.user_github_credentials g
      join public.profiles p on p.user_id = g.user_id
      where lower(g.github_username) = resolved_handle
      limit 1;
    if target_user_id is null then
      raise exception 'NOT_A_VIBEOPS_USER' using errcode = 'P0010',
        hint = format('@%s has not signed in to VibeOps yet — ask them to sign in first.', invitee_github);
    end if;
  else
    resolved_email := lower(trim(invitee_email));
    -- Fold profile lookup so we can verify they exist as a VibeOps user.
    select p.user_id into target_user_id
    from public.profiles p
    where lower(p.email) = resolved_email
    limit 1;
    -- Also try auth.identities verified emails (covers GitHub OAuth users
    -- whose primary on GitHub differs from auth.users.email).
    if target_user_id is null then
      select i.user_id into target_user_id
      from auth.identities i
      where lower(coalesce(i.identity_data->>'email', '')) = resolved_email
        or position(resolved_email in lower(coalesce(i.identity_data->>'emails', ''))) > 0
      limit 1;
    end if;
    if target_user_id is null then
      raise exception 'NOT_A_VIBEOPS_USER' using errcode = 'P0010',
        hint = format('%s is not a VibeOps user yet — ask them to sign in first.', invitee_email);
    end if;
  end if;

  -- url-safe token
  token_value := replace(replace(replace(token_value, '+', '-'), '/', '_'), '=', '');

  insert into public.invitations (workspace_id, email, role, token, invited_by, invitee_github_username)
  values (ws_id, resolved_email, invitee_role, token_value, auth.uid(), resolved_handle)
  returning * into inv;

  insert into public.activity_log (workspace_id, actor_user_id, action, target_type, target_id, payload)
  values (ws_id, auth.uid(), 'invitation.created', 'invitation', inv.id,
          jsonb_build_object('email', inv.email, 'github_username', inv.invitee_github_username,
                             'role', inv.role));

  return inv;
end;
$$ language plpgsql security definer;

grant execute on function public.invite_member_v2(uuid, text, text, member_role) to authenticated;

-- Keep the v1 invite_member function working but route through v2 so
-- existing renderer builds don't break and old callers also get the
-- existence check.
create or replace function public.invite_member(
  ws_id uuid, invitee_email text, invitee_role member_role default 'editor'
) returns public.invitations as $$
  select public.invite_member_v2(ws_id, invitee_email, null, invitee_role);
$$ language sql security definer;

-- =====================================================================
-- accept_invitation: match against any verified email on caller's auth
-- identities OR github username on the invitation.
-- =====================================================================
create or replace function public.accept_invitation(invite_token text)
returns public.workspace_members as $$
declare
  inv             public.invitations;
  caller_email    text;
  caller_handle   text;
  ws_name         text;
  invitee_email   text;
  new_member      public.workspace_members;
  matches         boolean := false;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  select email into caller_email from auth.users where id = auth.uid();
  select github_username into caller_handle
    from public.user_github_credentials where user_id = auth.uid();

  select * into inv from public.invitations
  where token = invite_token and accepted_at is null and declined_at is null
  limit 1;
  if not found then
    raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0004';
  end if;
  if inv.expires_at < now() then
    raise exception 'INVITATION_EXPIRED' using errcode = 'P0005';
  end if;

  -- Ownership check: any of the following counts as a match.
  if inv.invitee_github_username is not null
    and caller_handle is not null
    and lower(inv.invitee_github_username) = lower(caller_handle)
  then
    matches := true;
  elsif inv.email is not null and public.caller_email_matches(inv.email) then
    matches := true;
  end if;

  if not matches then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = 'P0006',
      hint = 'This invitation was sent to a different email or github user.';
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

  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and type = 'workspace.invitation_pending'
    and (payload->>'invitation_id')::uuid = inv.id;

  select name into ws_name from public.workspaces where id = inv.workspace_id;
  select email into invitee_email from public.profiles where user_id = auth.uid();
  insert into public.notifications (user_id, workspace_id, type, title, body, payload)
  values (
    inv.invited_by, inv.workspace_id,
    'workspace.invitation_accepted',
    coalesce(invitee_email, caller_handle, 'Someone') || ' accepted your invite to ' || coalesce(ws_name, 'workspace'),
    'They are now ' || inv.role || '.',
    jsonb_build_object('invitation_id', inv.id, 'invitee_id', auth.uid(),
                       'invitee_email', invitee_email, 'role', inv.role)
  );

  return new_member;
end;
$$ language plpgsql security definer;
