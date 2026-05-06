-- Comments table already exists from 0001_init.sql. Tighten RLS so we use
-- per-project visibility for finding + task comments, and broadcast over
-- supabase_realtime for live threads.

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select
  using (
    -- finding/task comments scoped via project visibility
    case
      when target_type = 'finding' then exists (
        select 1 from public.audit_findings f
        where f.id = target_id and public.is_project_visible(f.project_id)
      )
      when target_type = 'task' then exists (
        select 1 from public.tasks t
        where t.id = target_id and public.is_project_visible(t.project_id)
      )
      when target_type = 'memory' then exists (
        select 1 from public.memory_versions m
        where m.id = target_id and public.is_project_visible(m.project_id)
      )
      else public.is_workspace_member(workspace_id)
    end
  );

drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    public.is_workspace_writer(workspace_id) and author_user_id = auth.uid()
  );

alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.activity_log;

-- Helper to fetch comments with author profile joined in.
create or replace function public.list_comments(
  for_target_type text,
  for_target_id uuid
) returns table (
  id uuid,
  workspace_id uuid,
  target_type text,
  target_id uuid,
  author_user_id uuid,
  author_email text,
  author_display_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  updated_at timestamptz
) as $$
  select c.id, c.workspace_id, c.target_type, c.target_id, c.author_user_id,
         p.email, p.display_name, p.avatar_url,
         c.body, c.created_at, c.updated_at
  from public.comments c
  inner join public.profiles p on p.user_id = c.author_user_id
  where c.target_type = for_target_type and c.target_id = for_target_id
  order by c.created_at asc;
$$ language sql stable security definer;
grant execute on function public.list_comments(text, uuid) to authenticated;
