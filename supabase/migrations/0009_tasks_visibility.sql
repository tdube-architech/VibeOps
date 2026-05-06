-- Tasks should respect per-project visibility, not just workspace membership.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (public.is_project_visible(project_id));

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert
  with check (
    public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
    and created_by = auth.uid()
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update
  using (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id))
  with check (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete
  using (public.is_project_visible(project_id) and public.is_workspace_writer(workspace_id));
