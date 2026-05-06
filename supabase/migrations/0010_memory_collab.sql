-- Memory versions should respect per-project visibility, not just workspace.
drop policy if exists mv_select on public.memory_versions;
create policy mv_select on public.memory_versions for select
  using (public.is_project_visible(project_id));

drop policy if exists mv_insert on public.memory_versions;
create policy mv_insert on public.memory_versions for insert
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and authored_by_user_id = auth.uid()
  );

-- Allow Realtime broadcasts so connected clients get notified of new versions.
alter publication supabase_realtime add table public.memory_versions;
