-- Phase C3: capture the cwd's git HEAD at session start so we can physically
-- revert tracked files even after the session has ended.
alter table public.ai_sessions
  add column if not exists session_start_sha text;
