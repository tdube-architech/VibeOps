-- accept_invitation: turns an invitation token into a workspace membership
-- atomically, server-side. The web client calls this via supabase.rpc.

create or replace function public.accept_invitation(invite_token text)
returns public.workspace_members as $$
declare
  inv public.invitations;
  caller_email text;
  new_member public.workspace_members;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  select email into caller_email from auth.users where id = auth.uid();

  select * into inv from public.invitations
  where token = invite_token and accepted_at is null
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

  return new_member;
end;
$$ language plpgsql security definer;

grant execute on function public.accept_invitation(text) to authenticated;
