-- Per-user "watching" a task: get notified on any update.
create table if not exists public.task_watchers (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_watchers_user_idx on public.task_watchers (user_id);

alter table public.task_watchers enable row level security;

-- Note: trashed tasks (deleted_at is not null) are filtered by tasks_select,
-- so watcher rows referencing trashed tasks won't be readable until restore.
create policy task_watchers_select on public.task_watchers for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_watchers.task_id
        and public.is_project_visible(t.project_id)
    )
  );

create policy task_watchers_insert on public.task_watchers for insert
  with check (
    -- A user can always self-watch.
    user_id = auth.uid()
    or
    -- A workspace writer can add another workspace member as a watcher.
    (
      exists (
        select 1 from public.tasks t
        where t.id = task_watchers.task_id
          and public.is_workspace_writer(t.workspace_id)
      )
      and exists (
        select 1 from public.workspace_members wm
        join public.tasks t on t.workspace_id = wm.workspace_id
        where t.id = task_watchers.task_id
          and wm.user_id = task_watchers.user_id
      )
    )
  );

create policy task_watchers_delete on public.task_watchers for delete
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.task_watchers;
alter table public.task_watchers replica identity full;

-- Mentions inside task description / comments.
create table if not exists public.task_mentions (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks (id) on delete cascade,
  mentioned_user  uuid not null references auth.users (id) on delete cascade,
  source          text not null check (source in ('description', 'comment')),
  source_ref_id   uuid,
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now()
);
create index task_mentions_task_idx on public.task_mentions (task_id);
create index task_mentions_user_idx on public.task_mentions (mentioned_user);
-- Dedupe mentions: same user mentioned in same source slot shouldn't fan out twice.
create unique index task_mentions_unique_per_source
  on public.task_mentions (task_id, mentioned_user, source, coalesce(source_ref_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table public.task_mentions enable row level security;

create policy task_mentions_select on public.task_mentions for select
  using (
    mentioned_user = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_mentions.task_id
        and public.is_project_visible(t.project_id)
    )
  );

-- Inserts via SECURITY DEFINER RPC only (no INSERT policy for client).
create or replace function public.insert_task_mentions(
  p_task_id uuid, p_user_ids uuid[], p_source text, p_source_ref_id uuid
) returns void as $$
declare
  v_uid uuid;
  v_ws_id uuid;
begin
  if p_source not in ('description','comment') then
    raise exception 'BAD_SOURCE' using errcode='22023';
  end if;
  select t.workspace_id into v_ws_id
    from public.tasks t
    where t.id = p_task_id and public.is_project_visible(t.project_id);
  if v_ws_id is null then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  foreach v_uid in array p_user_ids loop
    if not exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = v_ws_id and wm.user_id = v_uid
    ) then
      continue; -- silently skip non-members; UI shouldn't surface them
    end if;
    insert into public.task_mentions (task_id, mentioned_user, source, source_ref_id, created_by)
    values (p_task_id, v_uid, p_source, p_source_ref_id, auth.uid())
    on conflict do nothing;
  end loop;
end;
$$ language plpgsql security definer;
grant execute on function public.insert_task_mentions(uuid, uuid[], text, uuid) to authenticated;
