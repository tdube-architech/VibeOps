-- Notify on assignee change. Inserts a notification row with deep link
-- to the Tasks page filtered to "Assigned to me".
create or replace function public.notify_task_assigned() returns trigger as $$
declare
  proj record;
  actor_email text;
begin
  if new.assignee_user_id is null then return new; end if;
  if (tg_op = 'UPDATE' and old.assignee_user_id is not distinct from new.assignee_user_id) then
    return new;
  end if;
  if new.assignee_user_id = auth.uid() then
    return new; -- self-assign: no notification
  end if;

  select p.id, p.name into proj from public.projects p where p.id = new.project_id;
  select email into actor_email from public.profiles where user_id = auth.uid();

  insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
  values (
    new.assignee_user_id,
    new.workspace_id,
    'task.assigned',
    'Task assigned: ' || new.title,
    coalesce(actor_email, 'Someone') || ' assigned you a task in ' || coalesce(proj.name, 'a project') || '.',
    '#/tasks?assignee=me',
    jsonb_build_object(
      'task_id', new.id,
      'project_id', new.project_id,
      'project_name', coalesce(proj.name, ''),
      'priority', new.priority,
      'status', new.status
    )
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists tasks_notify_assigned_insert on public.tasks;
create trigger tasks_notify_assigned_insert
  after insert on public.tasks
  for each row execute function public.notify_task_assigned();

drop trigger if exists tasks_notify_assigned_update on public.tasks;
create trigger tasks_notify_assigned_update
  after update of assignee_user_id on public.tasks
  for each row execute function public.notify_task_assigned();

-- Mention notification: fired by inserts into task_mentions.
create or replace function public.notify_task_mentioned() returns trigger as $$
declare
  task_row public.tasks;
  proj record;
  actor_email text;
begin
  if new.mentioned_user = new.created_by then return new; end if;
  select * into task_row from public.tasks where id = new.task_id;
  if not found then return new; end if;
  select p.id, p.name into proj from public.projects p where p.id = task_row.project_id;
  select email into actor_email from public.profiles where user_id = new.created_by;

  insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
  values (
    new.mentioned_user,
    task_row.workspace_id,
    'task.mentioned',
    'You were mentioned on a task',
    coalesce(actor_email, 'Someone') || ' tagged you on "' || task_row.title || '" in ' || coalesce(proj.name, 'a project') || '.',
    '#/tasks?assignee=me&task=' || task_row.id,
    jsonb_build_object('task_id', task_row.id, 'source', new.source)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists task_mentions_notify on public.task_mentions;
create trigger task_mentions_notify
  after insert on public.task_mentions
  for each row execute function public.notify_task_mentioned();

-- Watcher notifications on task UPDATE.
create or replace function public.notify_task_watchers_update() returns trigger as $$
declare w record; actor_email text; proj record; change_summary text;
begin
  if (new is not distinct from old) then return new; end if;
  if (old.deleted_at is null) <> (new.deleted_at is null) then return new; end if;

  select email into actor_email from public.profiles where user_id = auth.uid();
  select p.id, p.name into proj from public.projects p where p.id = new.project_id;

  change_summary :=
    case
      when old.status is distinct from new.status then 'moved to ' || new.status::text
      when old.priority is distinct from new.priority then 'priority changed to ' || new.priority::text
      when old.title is distinct from new.title then 'renamed'
      when old.description is distinct from new.description then 'description updated'
      else 'updated'
    end;

  for w in select user_id from public.task_watchers where task_id = new.id loop
    if w.user_id = auth.uid() then continue; end if;
    if w.user_id = new.assignee_user_id
       and old.assignee_user_id is distinct from new.assignee_user_id then
      continue; -- already notified via task.assigned
    end if;
    insert into public.notifications (user_id, workspace_id, type, title, body, link, payload)
    values (
      w.user_id,
      new.workspace_id,
      'task.updated',
      'Task ' || change_summary || ': ' || new.title,
      coalesce(actor_email, 'Someone') || ' ' || change_summary || ' in ' || coalesce(proj.name, 'a project') || '.',
      '#/tasks?task=' || new.id,
      jsonb_build_object('task_id', new.id, 'change', change_summary)
    );
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists tasks_notify_watchers on public.tasks;
create trigger tasks_notify_watchers
  after update of status, priority, title, description, assignee_user_id, related_files, suggested_prompt
  on public.tasks
  for each row execute function public.notify_task_watchers_update();
