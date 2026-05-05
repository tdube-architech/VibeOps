-- Local-dev seed: one user + free workspace + sample project.
-- Apply via: supabase db reset
--
-- Note: auth.users seeding requires service role; this only seeds public schema
-- assuming the user already exists. Use Supabase Studio "Add user" first.

-- Replace this UUID with your local auth user id after creating it
\set seed_user_id '00000000-0000-0000-0000-000000000001'

insert into public.workspaces (id, name, slug, owner_id, plan)
values ('00000000-0000-0000-0000-0000000000aa', 'My Workspace', 'my-workspace', :'seed_user_id', 'free')
on conflict (id) do nothing;

insert into public.projects (id, workspace_id, name, slug, description)
values (
  '00000000-0000-0000-0000-0000000000bb',
  '00000000-0000-0000-0000-0000000000aa',
  'VibeOps Sample',
  'vibeops-sample',
  'Sample project for local dev'
) on conflict (id) do nothing;
