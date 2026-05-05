-- Server-side workspace creation RPC. Runs with definer privileges so RLS
-- and quota triggers see auth.uid() consistently and the insert is atomic.

create or replace function public.create_workspace(ws_name text)
returns public.workspaces as $$
declare
  caller_id uuid := auth.uid();
  base_slug text;
  candidate_slug text;
  attempts int := 0;
  inserted public.workspaces;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;
  if coalesce(trim(ws_name), '') = '' then
    raise exception 'WORKSPACE_NAME_REQUIRED' using errcode = 'P0007';
  end if;

  base_slug := lower(regexp_replace(ws_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'workspace'; end if;

  candidate_slug := base_slug || '-' || substr(caller_id::text, 1, 6);
  while exists (select 1 from public.workspaces where slug = candidate_slug) and attempts < 5 loop
    attempts := attempts + 1;
    candidate_slug := base_slug || '-' || substr(caller_id::text, 1, 6) || '-' || attempts::text;
  end loop;

  insert into public.workspaces (name, slug, owner_id, plan)
  values (trim(ws_name), candidate_slug, caller_id, 'free')
  returning * into inserted;

  return inserted;
end;
$$ language plpgsql security definer;

grant execute on function public.create_workspace(text) to authenticated;

-- ensure_default_workspace: creates a default if user has none, returns existing first.
create or replace function public.ensure_default_workspace(display_label text)
returns public.workspaces as $$
declare
  caller_id uuid := auth.uid();
  existing public.workspaces;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0003';
  end if;

  select w.* into existing
  from public.workspaces w
  inner join public.workspace_members wm
    on wm.workspace_id = w.id and wm.user_id = caller_id
  order by w.created_at asc
  limit 1;

  if found then
    return existing;
  end if;

  return public.create_workspace(coalesce(display_label, 'My') || '''s Workspace');
end;
$$ language plpgsql security definer;

grant execute on function public.ensure_default_workspace(text) to authenticated;
