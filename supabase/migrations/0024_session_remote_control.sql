-- Phase C5: collaborative remote control of AI terminal sessions.
-- Owner toggles control_open. A teammate may then claim controller_user_id
-- (advisory single-driver lock) and broadcast keystrokes that the owner's
-- renderer forwards to the local PTY.

alter table public.ai_sessions
  add column if not exists control_open boolean not null default false,
  add column if not exists controller_user_id uuid references auth.users (id) on delete set null,
  add column if not exists controller_claimed_at timestamptz;

create index if not exists ai_sessions_control_idx
  on public.ai_sessions (id) where control_open = true;

-- =====================================================================
-- toggle_ai_session_control: owner-only switch.
-- =====================================================================
create or replace function public.toggle_ai_session_control(
  session_id uuid,
  is_open    boolean
) returns public.ai_sessions as $$
declare
  s public.ai_sessions;
begin
  select * into s from public.ai_sessions where id = session_id;
  if not found then
    raise exception 'AI_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if s.owner_user_id <> auth.uid() then
    raise exception 'AI_SESSION_NOT_OWNER' using errcode = 'P0011',
      hint = 'Only the session owner can toggle remote control.';
  end if;

  update public.ai_sessions
  set control_open = is_open,
      controller_user_id = case when is_open then controller_user_id else null end,
      controller_claimed_at = case when is_open then controller_claimed_at else null end
  where id = session_id
  returning * into s;
  return s;
end;
$$ language plpgsql security definer;

grant execute on function public.toggle_ai_session_control(uuid, boolean) to authenticated;

-- =====================================================================
-- claim_ai_session_control: a non-owner workspace member takes the seat.
-- Idempotent for the same caller; bumps anyone else off.
-- =====================================================================
create or replace function public.claim_ai_session_control(session_id uuid)
returns public.ai_sessions as $$
declare
  s public.ai_sessions;
begin
  select * into s from public.ai_sessions where id = session_id;
  if not found then
    raise exception 'AI_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not public.is_project_visible(s.project_id) then
    raise exception 'AI_SESSION_NOT_VISIBLE' using errcode = 'P0012';
  end if;
  if not s.control_open then
    raise exception 'AI_SESSION_CONTROL_CLOSED' using errcode = 'P0013',
      hint = 'The session owner has not enabled remote control.';
  end if;
  if s.owner_user_id = auth.uid() then
    raise exception 'AI_SESSION_OWNER_CLAIM' using errcode = 'P0014',
      hint = 'Owner already drives the session.';
  end if;

  update public.ai_sessions
  set controller_user_id = auth.uid(),
      controller_claimed_at = now()
  where id = session_id
  returning * into s;
  return s;
end;
$$ language plpgsql security definer;

grant execute on function public.claim_ai_session_control(uuid) to authenticated;

-- =====================================================================
-- release_ai_session_control: caller drops the seat (or owner force-clears).
-- =====================================================================
create or replace function public.release_ai_session_control(session_id uuid)
returns public.ai_sessions as $$
declare
  s public.ai_sessions;
begin
  select * into s from public.ai_sessions where id = session_id;
  if not found then
    raise exception 'AI_SESSION_NOT_FOUND' using errcode = 'P0001';
  end if;
  if s.owner_user_id <> auth.uid() and s.controller_user_id <> auth.uid() then
    raise exception 'AI_SESSION_RELEASE_FORBIDDEN' using errcode = 'P0015';
  end if;
  update public.ai_sessions
  set controller_user_id = null,
      controller_claimed_at = null
  where id = session_id
  returning * into s;
  return s;
end;
$$ language plpgsql security definer;

grant execute on function public.release_ai_session_control(uuid) to authenticated;
