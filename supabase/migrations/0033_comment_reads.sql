-- Per-user read marks for comment threads. Multi-device-synced unread state.
create table if not exists public.comment_reads (
  user_id       uuid not null references auth.users (id) on delete cascade,
  target_type   text not null,
  target_id     uuid not null,
  last_read_at  timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
create index comment_reads_user_idx on public.comment_reads (user_id);

alter table public.comment_reads enable row level security;

drop policy if exists comment_reads_self on public.comment_reads;
create policy comment_reads_self on public.comment_reads for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter publication supabase_realtime add table public.comment_reads;
alter table public.comment_reads replica identity full;

-- Summary of comment counts per task (total + unread for the calling user).
create or replace function public.task_comment_summary()
returns table (target_id uuid, total int, unread int)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select
    c.target_id,
    count(*)::int as total,
    count(*) filter (
      where cr.last_read_at is null or c.created_at > cr.last_read_at
    )::int as unread
  from public.comments c
  left join public.comment_reads cr
    on cr.user_id = auth.uid()
    and cr.target_type = c.target_type
    and cr.target_id = c.target_id
  where c.target_type = 'task'
  group by c.target_id;
$$;
grant execute on function public.task_comment_summary() to authenticated;

-- Mark all comments on a task as read up to now.
create or replace function public.mark_task_comments_read(p_task_id uuid)
returns void
language sql security invoker
set search_path = public, pg_temp
as $$
  insert into public.comment_reads (user_id, target_type, target_id, last_read_at)
  values (auth.uid(), 'task', p_task_id, now())
  on conflict (user_id, target_type, target_id)
    do update set last_read_at = excluded.last_read_at;
$$;
grant execute on function public.mark_task_comments_read(uuid) to authenticated;
