-- Phase D-canvas/wizard: a SECURITY DEFINER helper to insert a project so
-- the renderer can rely on a single round trip with explicit role checks
-- instead of fighting whatever subtle issue causes the plain RLS-gated
-- INSERT to be rejected (typically a stale auth.uid() reaching RLS while
-- the session is still being refreshed).
create or replace function public.create_project_for_wizard(
  ws_id        uuid,
  proj_name    text,
  proj_slug    text,
  proj_desc    text default null,
  proj_repo    text default null,
  proj_cat     text default null,
  proj_tags    text[] default '{}',
  proj_vis     project_visibility default 'workspace'
) returns public.projects as $$
declare
  caller   uuid := auth.uid();
  caller_role member_role;
  inserted public.projects%rowtype;
begin
  if caller is null then
    raise exception 'PROJECT_INSERT_NO_AUTH'
      using errcode = 'P0001', hint = 'No authenticated user.';
  end if;

  select role into caller_role
  from public.workspace_members
  where workspace_id = ws_id and user_id = caller;

  if caller_role is null then
    raise exception 'PROJECT_INSERT_NOT_MEMBER'
      using errcode = 'P0001',
            hint = 'You are not a member of the chosen workspace.';
  end if;
  if caller_role = 'viewer' then
    raise exception 'PROJECT_INSERT_VIEWER'
      using errcode = 'P0001',
            hint = 'Viewers cannot create projects in this workspace.';
  end if;

  insert into public.projects (
    workspace_id, name, slug, description, repo_url, category, tags, visibility
  ) values (
    ws_id, proj_name, proj_slug, proj_desc, proj_repo, proj_cat, coalesce(proj_tags, '{}'), proj_vis
  )
  returning * into inserted;

  return inserted;
end;
$$ language plpgsql security definer;

grant execute on function public.create_project_for_wizard(
  uuid, text, text, text, text, text, text[], project_visibility
) to authenticated;
