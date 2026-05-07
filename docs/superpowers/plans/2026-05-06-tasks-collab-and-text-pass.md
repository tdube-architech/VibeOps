# Tasks Collab + Text Pass + Scan Sync Verify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Tasks page to a real collaborative kanban (drag-drop, soft-delete trash, popout, assignee + notify, filter bar, teams), unify app-wide text styles, and prove scan sync end-to-end across two cloud users.

**Architecture:**
- Tasks table already cloud-side (`public.tasks`) with workspace+project RLS, `assignee_user_id`, optimistic-concurrency `version`. Workspace realtime already wired in `AppShell` via `useWorkspaceTasksRealtime`.
- Add: `tasks.deleted_at` (soft-delete), `task_watchers` (per-user watch), `task_mentions` (logged on insert into comments), `teams` + `team_members` (new schema, backfill default `Everyone` per workspace).
- Drag-and-drop via `@dnd-kit/core` (kanban columns + bottom-right trash dock as drop target).
- Popout = shadcn `Dialog`. Comment thread already exists; add inline `@`-mention parser → emits `task.mention` notification.
- Assign trigger = pg trigger on `tasks` `UPDATE OF assignee_user_id` → inserts `notifications` row with `link='#/tasks?assignee=me'`.
- 30-day trash purge = Supabase Edge Function `tasks-trash-purge` invoked daily by `pg_cron`.
- Text pass = consolidate type scale into Tailwind utilities, sweep all routes/features for one-offs.
- Scan-sync verify = manual 2-account smoke checklist in plan acceptance.

**Tech Stack:** Electron + React + Vite + TanStack Query + Supabase (Postgres + Realtime + Edge Functions) + Tailwind + shadcn-ui + `@dnd-kit/core`.

---

## File Structure

**New migrations:**
- `supabase/migrations/0027_tasks_soft_delete.sql` — `tasks.deleted_at`, RLS update, restore RPC
- `supabase/migrations/0028_task_watchers_mentions.sql` — `task_watchers`, `task_mentions`
- `supabase/migrations/0029_task_assign_notify.sql` — assign/mention/watch notification triggers
- `supabase/migrations/0030_tasks_purge_cron.sql` — pg_cron job that calls edge function
- `supabase/migrations/0032_teams.sql` — `teams`, `team_members`, RLS, backfill `Everyone`

**New edge function:**
- `supabase/functions/tasks-trash-purge/index.ts` — daily hard-delete trash older than 30d

**New renderer:**
- `src/renderer/features/tasks/TaskBoard.tsx` — DnD kanban (replaces existing inline grid in `TasksRoute`)
- `src/renderer/features/tasks/TaskColumn.tsx` — droppable column
- `src/renderer/features/tasks/DraggableTaskCard.tsx` — draggable wrapper for `TaskCard`
- `src/renderer/features/tasks/TrashDock.tsx` — bottom-right floating drop target
- `src/renderer/features/tasks/TrashView.tsx` — trash drawer with restore + empty
- `src/renderer/features/tasks/TaskPopout.tsx` — modal: description, mentions, assignee, watchers
- `src/renderer/features/tasks/AssigneePicker.tsx` — combobox of workspace + shared-project members
- `src/renderer/features/tasks/WatcherChips.tsx` — multi-select watcher list
- `src/renderer/features/tasks/MentionInput.tsx` — textarea with `@user` autocomplete
- `src/renderer/features/tasks/TaskFilterBar.tsx` — All / Assigned-to-me / Assigned-to-…
- `src/renderer/features/tasks/useTaskMembers.ts` — pull workspace + project + team member union
- `src/renderer/features/tasks/useTrash.ts` — list trashed, restore, empty trash
- `src/renderer/features/teams/useTeams.ts` — list/create/delete teams
- `src/renderer/features/teams/TeamsCard.tsx` — workspace settings panel
- `src/renderer/lib/data/teams.ts` — teams CRUD
- `src/renderer/styles/typography.css` — typography utility classes (h1/h2/h3/body/meta/menu)

**Modified renderer:**
- `src/renderer/lib/data/tasks.ts` — soft-delete write path, `listTrash`, `restoreTask`, `emptyTrash`, `assigneeUserId` in patch, watchers, `?deleted=` query
- `src/renderer/features/tasks/useTasks.ts` — `useTrash`, `useRestoreTask`, `useEmptyTrash`, `useAssignTask`, `useToggleWatcher`
- `src/renderer/features/tasks/TaskCard.tsx` — double-click → opens `TaskPopout`; show assignee avatar
- `src/renderer/routes/TasksRoute.tsx` — render `TaskBoard` + `TrashDock` + `TaskFilterBar`
- `src/shared/types.ts` — `Task.deletedAt`, `Task.assigneeUserId`, `TaskPatch.assigneeUserId`, `TaskListQuery.assignee`/`includeDeleted`, `Team`, `TeamMember`
- `tailwind.config.cjs` — register typography plugin / font sizes
- `src/renderer/index.css` — import `typography.css`

**Modified package:**
- `package.json` — add `@dnd-kit/core`, `@dnd-kit/sortable`

**Acceptance docs:**
- `docs/QA/2026-05-06-scan-sync-2-user-checklist.md` — manual smoke checklist

---

# PHASE A — Schema: soft-delete, watchers, mentions, assignee notify

## Task A1: `0027_tasks_soft_delete` migration

**Files:**
- Create: `supabase/migrations/0027_tasks_soft_delete.sql`

- [ ] **Step 1: Write migration**

```sql
-- Soft-delete tasks. Trash retention = 30 days; edge function purges older.
alter table public.tasks
  add column if not exists deleted_at timestamptz;

create index if not exists tasks_deleted_idx
  on public.tasks (deleted_at)
  where deleted_at is not null;

-- Hide deleted rows from default reads.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select
  using (
    public.is_project_visible(project_id)
    and deleted_at is null
  );

-- Separate policy lets a user read their own trash (workspace-writers see ws-trash).
drop policy if exists tasks_select_trash on public.tasks;
create policy tasks_select_trash on public.tasks for select
  using (
    deleted_at is not null
    and public.is_project_visible(project_id)
    and public.is_workspace_writer(workspace_id)
  );

-- Soft-delete RPC (UPDATE under RLS still requires write perm).
create or replace function public.soft_delete_task(task_id uuid)
returns public.tasks as $$
declare row public.tasks;
begin
  update public.tasks
    set deleted_at = now()
    where id = task_id and deleted_at is null
    returning * into row;
  if not found then
    raise exception 'TASK_NOT_FOUND_OR_ALREADY_DELETED' using errcode = 'P0013';
  end if;
  return row;
end;
$$ language plpgsql security invoker;
grant execute on function public.soft_delete_task(uuid) to authenticated;

-- Restore RPC.
create or replace function public.restore_task(task_id uuid)
returns public.tasks as $$
declare row public.tasks;
begin
  update public.tasks
    set deleted_at = null
    where id = task_id and deleted_at is not null
    returning * into row;
  if not found then
    raise exception 'TASK_NOT_DELETED' using errcode = 'P0013';
  end if;
  return row;
end;
$$ language plpgsql security invoker;
grant execute on function public.restore_task(uuid) to authenticated;

-- Empty-trash for the active workspace (caller must be writer).
create or replace function public.empty_trash(ws_id uuid)
returns int as $$
declare deleted_count int;
begin
  if not public.is_workspace_writer(ws_id) then
    raise exception 'NOT_AUTHORIZED' using errcode = '42501';
  end if;
  delete from public.tasks
    where workspace_id = ws_id
      and deleted_at is not null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer;
grant execute on function public.empty_trash(uuid) to authenticated;
```

- [ ] **Step 2: Apply + verify**

Run: `npx supabase db push`
Expected: migration applied; `\d public.tasks` shows `deleted_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0027_tasks_soft_delete.sql
git commit -m "feat(tasks): soft-delete + restore + empty_trash RPCs"
```

---

## Task A2: `0028_task_watchers_mentions` migration

**Files:**
- Create: `supabase/migrations/0028_task_watchers_mentions.sql`

- [ ] **Step 1: Write migration**

```sql
-- Per-user "watching" a task: get notified on any update.
create table if not exists public.task_watchers (
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_watchers_user_idx on public.task_watchers (user_id);

alter table public.task_watchers enable row level security;

create policy task_watchers_select on public.task_watchers for select
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_watchers.task_id
        and public.is_project_visible(t.project_id)
    )
  );

create policy task_watchers_insert on public.task_watchers for insert
  with check (user_id = auth.uid());

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
declare uid uuid;
begin
  if p_source not in ('description','comment') then
    raise exception 'BAD_SOURCE' using errcode='22023';
  end if;
  if not exists (
    select 1 from public.tasks t
    where t.id = p_task_id and public.is_project_visible(t.project_id)
  ) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  foreach uid in array p_user_ids loop
    insert into public.task_mentions (task_id, mentioned_user, source, source_ref_id, created_by)
    values (p_task_id, uid, p_source, p_source_ref_id, auth.uid());
  end loop;
end;
$$ language plpgsql security definer;
grant execute on function public.insert_task_mentions(uuid, uuid[], text, uuid) to authenticated;
```

- [ ] **Step 2: Apply + verify**

Run: `npx supabase db push`
Expected: tables `task_watchers`, `task_mentions` exist with RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0028_task_watchers_mentions.sql
git commit -m "feat(tasks): task_watchers + task_mentions tables w/ RLS"
```

---

## Task A3: `0029_task_assign_notify` migration

**Files:**
- Create: `supabase/migrations/0029_task_assign_notify.sql`

- [ ] **Step 1: Write migration**

```sql
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
$$ language plpgsql security definer;

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
$$ language plpgsql security definer;

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
$$ language plpgsql security definer;

drop trigger if exists tasks_notify_watchers on public.tasks;
create trigger tasks_notify_watchers
  after update on public.tasks
  for each row execute function public.notify_task_watchers_update();
```

- [ ] **Step 2: Apply + smoke**

Run: `npx supabase db push`
Smoke (in SQL editor as user A): insert task with `assignee_user_id = <user B>`. Confirm `notifications` row appears for B.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_task_assign_notify.sql
git commit -m "feat(tasks): assign + mention + watcher notification triggers"
```

---

# PHASE B — Renderer plumbing: types, data, hooks

## Task B1: extend shared types

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Replace Task / TaskPatch / TaskListQuery and add Team types**

```ts
export interface Task {
  id: string;
  projectId: string;
  sourceFindingId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeUserId: string | null;
  relatedFiles: string[];
  suggestedPrompt: string | null;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  watcherUserIds?: string[];
  version?: number;
}

export interface TaskPatch {
  id: string;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeUserId?: string | null;
  relatedFiles?: string[];
  suggestedPrompt?: string | null;
}

export interface TaskListQuery {
  projectId?: string;
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  assignee?: 'me' | string;
  trashOnly?: boolean;
}

export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: 'lead' | 'member';
  joinedAt: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm build:typecheck`
Expected: errors in `src/renderer/lib/data/tasks.ts` and tasks features for missing fields. Fixed in B2/B3.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add Task.assigneeUserId/deletedAt + Team types"
```

---

## Task B2: data layer for tasks (soft-delete + assignee + watchers + trash)

**Files:**
- Modify: `src/renderer/lib/data/tasks.ts`

- [ ] **Step 1: Update `TaskRow` + `rowToTask`**

```ts
interface TaskRow {
  id: string;
  project_id: string;
  workspace_id: string;
  source_finding_id: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assignee_user_id: string | null;
  related_files: string[] | null;
  suggested_prompt: string | null;
  created_by: string;
  created_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  version?: number;
}

function rowToTask(row: TaskRow): Task {
  const t: Task = {
    id: row.id,
    projectId: row.project_id,
    sourceFindingId: row.source_finding_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assigneeUserId: row.assignee_user_id,
    relatedFiles: row.related_files ?? [],
    suggestedPrompt: row.suggested_prompt,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at
  };
  if (row.version !== undefined) t.version = row.version;
  return t;
}
```

- [ ] **Step 2: Update `listTasks` to honor `trashOnly` + `assignee`**

```ts
export async function listTasks(q: TaskListQuery & { workspaceId?: string; cloudOnly?: boolean }): Promise<Task[]> {
  const supabase = getSupabase();
  if (q.projectId && !isCloud(q.projectId)) return api.tasks.list(q);

  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (q.workspaceId) query = query.eq('workspace_id', q.workspaceId);
  if (q.projectId) query = query.eq('project_id', q.projectId);
  if (q.status && q.status !== 'all') query = query.eq('status', q.status);
  if (q.priority && q.priority !== 'all') query = query.eq('priority', q.priority);
  if (q.trashOnly) {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }
  if (q.assignee === 'me') {
    const userId = await getCurrentUserId();
    query = query.eq('assignee_user_id', userId);
  } else if (q.assignee) {
    query = query.eq('assignee_user_id', q.assignee);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const cloud = ((data ?? []) as TaskRow[]).map(rowToTask);

  if (q.cloudOnly || q.trashOnly) return cloud;

  if (!q.projectId) {
    try {
      const local = await api.tasks.list(q);
      return [...cloud, ...local.filter((t) => !isCloud(t.id))];
    } catch { return cloud; }
  }
  return cloud;
}
```

- [ ] **Step 3: Add soft-delete + restore + empty-trash**

```ts
export async function softDeleteTask(id: string): Promise<void> {
  if (!isCloud(id)) { await api.tasks.remove(id); return; }
  const supabase = getSupabase();
  const { error } = await supabase.rpc('soft_delete_task', { task_id: id });
  if (error) throw new Error(error.message);
}

export async function restoreTask(id: string): Promise<void> {
  if (!isCloud(id)) return; // local backend has no trash
  const supabase = getSupabase();
  const { error } = await supabase.rpc('restore_task', { task_id: id });
  if (error) throw new Error(error.message);
}

export async function emptyTrash(workspaceId: string): Promise<number> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('empty_trash', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// Existing removeTask now soft-deletes (existing UI uses this).
export async function removeTask(id: string): Promise<void> {
  return softDeleteTask(id);
}

export async function hardDeleteTask(id: string): Promise<void> {
  if (!isCloud(id)) { await api.tasks.remove(id); return; }
  const supabase = getSupabase();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Extend `updateTask` to write `assignee_user_id`**

In the non-versioned branch:
```ts
if (patch.assigneeUserId !== undefined) update.assignee_user_id = patch.assigneeUserId;
```
In the versioned branch:
```ts
if (patch.assigneeUserId !== undefined) patchObj.assignee_user_id = patch.assigneeUserId;
```

- [ ] **Step 5: Watchers helpers**

```ts
export async function listTaskWatchers(taskId: string): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('task_watchers').select('user_id').eq('task_id', taskId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

export async function addTaskWatcher(taskId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('task_watchers').insert({ task_id: taskId, user_id: userId });
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
}

export async function removeTaskWatcher(taskId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('task_watchers').delete()
    .eq('task_id', taskId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 6: Mentions writer (uses RPC from A2)**

```ts
export async function recordTaskMentions(
  taskId: string, mentionedUserIds: string[], source: 'description' | 'comment', sourceRefId?: string
): Promise<void> {
  if (mentionedUserIds.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase.rpc('insert_task_mentions', {
    p_task_id: taskId,
    p_user_ids: mentionedUserIds,
    p_source: source,
    p_source_ref_id: sourceRefId ?? null
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm build:typecheck
git add src/renderer/lib/data/tasks.ts
git commit -m "feat(tasks/data): soft-delete RPCs, assignee, watchers, mentions"
```

---

## Task B3: hooks for trash / assign / watch / mentions

**Files:**
- Modify: `src/renderer/features/tasks/useTasks.ts`

- [ ] **Step 1: Add hooks**

```ts
import {
  addTaskWatcher,
  emptyTrash as svcEmptyTrash,
  listTaskWatchers,
  recordTaskMentions,
  removeTaskWatcher,
  restoreTask as svcRestore,
  softDeleteTask as svcSoftDelete
} from '@/lib/data/tasks';

export function useTrashList() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: [...KEY, 'trash', wsId],
    queryFn: () => listTasks({ workspaceId: wsId ?? undefined, trashOnly: true }),
    enabled: isUuid(wsId)
  });
}

export function useSoftDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svcSoftDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRestoreTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svcRestore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => svcEmptyTrash(workspaceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useTaskWatchers(taskId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'watchers', taskId],
    queryFn: () => (taskId ? listTaskWatchers(taskId) : Promise.resolve([])),
    enabled: !!taskId && isUuid(taskId)
  });
}

export function useToggleWatcher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { taskId: string; userId: string; on: boolean }) => {
      if (args.on) await addTaskWatcher(args.taskId, args.userId);
      else await removeTaskWatcher(args.taskId, args.userId);
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: [...KEY, 'watchers', vars.taskId] })
  });
}

export function useRecordMentions() {
  return useMutation({
    mutationFn: (args: { taskId: string; userIds: string[]; source: 'description' | 'comment'; sourceRefId?: string }) =>
      recordTaskMentions(args.taskId, args.userIds, args.source, args.sourceRefId)
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/tasks/useTasks.ts
git commit -m "feat(tasks/hooks): trash list, restore, empty, watchers, mentions"
```

---

## Task B4: members hook

**Files:**
- Create: `src/renderer/features/tasks/useTaskMembers.ts`

- [ ] **Step 1: Module**

```ts
import { useQuery } from '@tanstack/react-query';
import { listMembers, type WorkspaceMember } from '@/lib/data/members';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';

export interface TaskMember {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Workspace members baseline. Phase F union with team members happens implicitly
// (team members are workspace members). Cross-workspace project sharing is
// future work and intentionally NOT included.
export function useTaskMembers() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: ['tasks', 'members', wsId],
    queryFn: async (): Promise<TaskMember[]> => {
      if (!wsId) return [];
      const members = await listMembers(wsId);
      return members.map((m: WorkspaceMember) => ({
        userId: m.userId,
        email: m.email,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl
      }));
    },
    enabled: !!wsId
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/tasks/useTaskMembers.ts
git commit -m "feat(tasks): useTaskMembers hook (workspace baseline)"
```

---

# PHASE C — DnD kanban + trash dock + popout

## Task C1: install `@dnd-kit/core` and `@dnd-kit/sortable`

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

Run: `pnpm add @dnd-kit/core @dnd-kit/sortable`

- [ ] **Step 2: Verify build still passes**

Run: `pnpm build:typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add @dnd-kit/core + @dnd-kit/sortable"
```

---

## Task C2: `DraggableTaskCard` + `TaskColumn` + `TaskBoard`

**Files:**
- Create: `src/renderer/features/tasks/DraggableTaskCard.tsx`
- Create: `src/renderer/features/tasks/TaskColumn.tsx`
- Create: `src/renderer/features/tasks/TaskBoard.tsx`

- [ ] **Step 1: `DraggableTaskCard.tsx`**

```tsx
import { useDraggable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import type { Task } from '@shared/types';

export function DraggableTaskCard({ task, projectName }: { task: Task; projectName?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-40' : ''}
      style={{ touchAction: 'none' }}
    >
      <TaskCard task={task} {...(projectName ? { projectName } : {})} />
    </div>
  );
}
```

- [ ] **Step 2: `TaskColumn.tsx`**

```tsx
import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DraggableTaskCard } from './DraggableTaskCard';
import type { Task, TaskStatus } from '@shared/types';

export function TaskColumn({
  status, label, items, projectMap
}: {
  status: TaskStatus;
  label: string;
  items: Task[];
  projectMap: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <Card className={`lg:col-span-1 ${isOver ? 'ring-2 ring-primary/60' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{label}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </CardTitle>
        <CardDescription className="sr-only">Tasks in {label}</CardDescription>
      </CardHeader>
      <CardContent ref={setNodeRef} className="space-y-2 min-h-24">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">—</div>
        ) : (
          items.map((t) => (
            <DraggableTaskCard
              key={t.id}
              task={t}
              {...(projectMap.get(t.projectId) ? { projectName: projectMap.get(t.projectId)! } : {})}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: `TaskBoard.tsx`**

```tsx
import { useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { TaskColumn } from './TaskColumn';
import { TrashDock } from './TrashDock';
import { useUpdateTask, useSoftDeleteTask } from './useTasks';
import { toast } from '@/lib/toast';
import type { Task, TaskStatus } from '@shared/types';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'next', label: 'Next' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' }
];

export function TaskBoard({ tasks, projectMap }: { tasks: Task[]; projectMap: Map<string, string> }) {
  const update = useUpdateTask();
  const softDelete = useSoftDeleteTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const t of tasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    return map;
  }, [tasks]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    if (overId === 'trash') {
      softDelete.mutate(taskId, {
        onSuccess: () => toast.info('Sent to trash', 'Restorable for 30 days')
      });
      return;
    }
    if (overId.startsWith('col:')) {
      const next = overId.slice(4) as TaskStatus;
      const current = tasksById.get(taskId);
      if (!current || current.status === next) return;
      update.mutate({ id: taskId, status: next, expectedVersion: current.version });
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {COLUMNS.map((c) => (
          <TaskColumn
            key={c.status}
            status={c.status}
            label={c.label}
            items={byStatus.get(c.status) ?? []}
            projectMap={projectMap}
          />
        ))}
      </div>
      <TrashDock />
    </DndContext>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/tasks/DraggableTaskCard.tsx src/renderer/features/tasks/TaskColumn.tsx src/renderer/features/tasks/TaskBoard.tsx
git commit -m "feat(tasks): DnD kanban with @dnd-kit"
```

---

## Task C3: `TrashDock` (drop target) + `TrashView` drawer

**Files:**
- Create: `src/renderer/features/tasks/TrashDock.tsx`
- Create: `src/renderer/features/tasks/TrashView.tsx`

- [ ] **Step 1: `TrashDock.tsx`**

```tsx
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';
import { TrashView } from './TrashView';
import { useTrashList } from './useTasks';

export function TrashDock() {
  const [open, setOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  const { data: trash = [] } = useTrashList();

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full border shadow-lg transition',
          isOver ? 'scale-110 border-destructive bg-destructive/10 ring-2 ring-destructive' : 'border-border bg-popover'
        ].join(' ')}
        title={`Trash · ${trash.length}`}
      >
        <Trash2 className="h-5 w-5" />
        {trash.length > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {trash.length > 99 ? '99+' : trash.length}
          </span>
        )}
      </button>
      <TrashView open={open} onOpenChange={setOpen} />
    </>
  );
}
```

- [ ] **Step 2: `TrashView.tsx`**

```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, RotateCcw } from 'lucide-react';
import { useTrashList, useRestoreTask, useEmptyTrash } from './useTasks';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { toast } from '@/lib/toast';

export function TrashView({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: trash = [] } = useTrashList();
  const restore = useRestoreTask();
  const empty = useEmptyTrash();
  const wsId = useActiveWorkspaceId();

  function onEmpty() {
    if (!wsId) return;
    if (!window.confirm(`Permanently delete all ${trash.length} task(s) in trash?`)) return;
    empty.mutate(wsId, {
      onSuccess: (n) => toast.success('Trash emptied', `${n} task(s) permanently deleted`)
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Tasks here are restorable. Items older than 30 days are permanently deleted automatically.
          </DialogDescription>
        </DialogHeader>
        {trash.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</div>
        ) : (
          <ul className="divide-y divide-border max-h-96 overflow-y-auto">
            {trash.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Deleted {t.deletedAt ? new Date(t.deletedAt).toLocaleString() : '—'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => restore.mutate(t.id, {
                    onSuccess: () => toast.success('Restored', t.title)
                  })}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="destructive"
            disabled={trash.length === 0 || empty.isPending}
            onClick={onEmpty}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Empty Trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/tasks/TrashDock.tsx src/renderer/features/tasks/TrashView.tsx
git commit -m "feat(tasks): TrashDock dock + TrashView restore/empty drawer"
```

---

## Task C4: `TaskFilterBar`

**Files:**
- Create: `src/renderer/features/tasks/TaskFilterBar.tsx`

- [ ] **Step 1: Component**

```tsx
import { useTaskMembers } from './useTaskMembers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function TaskFilterBar({
  value, onChange
}: { value: 'all' | 'me' | string; onChange: (v: 'all' | 'me' | string) => void }) {
  const { data: members = [] } = useTaskMembers();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Assignee</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="me">Assigned to me</SelectItem>
          {members.length > 0 && (
            <div className="border-t border-border my-1" />
          )}
          {members.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.displayName ?? m.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/tasks/TaskFilterBar.tsx
git commit -m "feat(tasks): assignee filter bar (All / me / member)"
```

---

## Task C5: wire `TaskBoard` + filter into `TasksRoute`

**Files:**
- Modify: `src/renderer/routes/TasksRoute.tsx`

- [ ] **Step 1: Replace inline grid with `TaskBoard` + add filter + URL sync**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/EmptyState';
import { AddTaskDialog } from '@/features/tasks/AddTaskDialog';
import { TaskBoard } from '@/features/tasks/TaskBoard';
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar';
import { useTaskList } from '@/features/tasks/useTasks';
import { useProjectList } from '@/features/projects/useProjects';

export function TasksRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialAssignee = params.get('assignee');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'me' | string>(
    initialAssignee === 'me' ? 'me' : initialAssignee ?? 'all'
  );

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    if (assigneeFilter === 'all') next.delete('assignee');
    else next.set('assignee', assigneeFilter);
    const search = next.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [assigneeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: projects = [] } = useProjectList();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const query: Parameters<typeof useTaskList>[0] = {};
  if (projectFilter !== 'all') query.projectId = projectFilter;
  if (assigneeFilter === 'me') query.assignee = 'me';
  else if (assigneeFilter !== 'all') query.assignee = assigneeFilter;

  const { data: tasks = [], isLoading } = useTaskList(query);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Drag tasks between columns. Drop on the trash to delete.</p>
        </div>
        <AddTaskDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-3">
            <TaskFilterBar value={assigneeFilter} onChange={setAssigneeFilter} />
            <Label className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">Project</span>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          </CardTitle>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<ListChecks className="h-6 w-6" />}
              title="No tasks"
              description="Click Add Task above, or open a project's Audits tab and convert findings into tasks."
            />
          </CardContent>
        </Card>
      ) : (
        <TaskBoard tasks={tasks} projectMap={projectMap} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/routes/TasksRoute.tsx
git commit -m "feat(tasks): TasksRoute uses TaskBoard + filter bar + URL sync"
```

---

## Task C6: `TaskPopout` + `AssigneePicker` + `WatcherChips` + `MentionInput`

**Files:**
- Create: `src/renderer/features/tasks/TaskPopout.tsx`
- Create: `src/renderer/features/tasks/AssigneePicker.tsx`
- Create: `src/renderer/features/tasks/WatcherChips.tsx`
- Create: `src/renderer/features/tasks/MentionInput.tsx`
- Modify: `src/renderer/features/tasks/TaskCard.tsx`

- [ ] **Step 1: `MentionInput.tsx`**

```tsx
import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useTaskMembers, type TaskMember } from './useTaskMembers';

export function MentionInput({
  value, onChange, onMentionsChange, placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  onMentionsChange?: (userIds: string[]) => void;
  placeholder?: string;
}) {
  const { data: members = [] } = useTaskMembers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart;
    const before = v.slice(0, cursor);
    const m = /@([\w.-]*)$/.exec(before);
    if (m) {
      setQuery(m[1] ?? '');
      setOpen(true);
    } else {
      setOpen(false);
    }
    if (onMentionsChange) onMentionsChange(collectMentions(v, members));
  }

  function pick(m: TaskMember) {
    if (!ref.current) return;
    const cursor = ref.current.selectionStart;
    const before = value.slice(0, cursor).replace(/@[\w.-]*$/, `@${m.email.split('@')[0]} `);
    const next = before + value.slice(cursor);
    onChange(next);
    setOpen(false);
    if (onMentionsChange) onMentionsChange(collectMentions(next, members));
  }

  const filtered = members.filter((m) => {
    const handle = (m.email.split('@')[0] ?? '').toLowerCase();
    const name = (m.displayName ?? '').toLowerCase();
    return handle.includes(query.toLowerCase()) || name.includes(query.toLowerCase());
  }).slice(0, 6);

  return (
    <div className="relative">
      <Textarea ref={ref} value={value} onChange={onInput} placeholder={placeholder} />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow">
          {filtered.map((m) => (
            <li
              key={m.userId}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-secondary/40"
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              {m.displayName ?? m.email}
              <span className="ml-2 text-xs text-muted-foreground">@{m.email.split('@')[0]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function collectMentions(text: string, members: TaskMember[]): string[] {
  const ids = new Set<string>();
  const re = /@([\w.-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const handle = m[1]!.toLowerCase();
    const hit = members.find((x) => (x.email.split('@')[0] ?? '').toLowerCase() === handle);
    if (hit) ids.add(hit.userId);
  }
  return Array.from(ids);
}
```

- [ ] **Step 2: `AssigneePicker.tsx`**

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTaskMembers } from './useTaskMembers';

export function AssigneePicker({
  value, onChange
}: { value: string | null; onChange: (userId: string | null) => void }) {
  const { data: members = [] } = useTaskMembers();
  return (
    <Select value={value ?? '__unassigned'} onValueChange={(v) => onChange(v === '__unassigned' ? null : v)}>
      <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__unassigned">Unassigned</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>{m.displayName ?? m.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 3: `WatcherChips.tsx`**

```tsx
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTaskMembers } from './useTaskMembers';
import { useTaskWatchers, useToggleWatcher } from './useTasks';

export function WatcherChips({ taskId }: { taskId: string }) {
  const { data: members = [] } = useTaskMembers();
  const { data: watcherIds = [] } = useTaskWatchers(taskId);
  const toggle = useToggleWatcher();
  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const eligible = members.filter((m) => !watcherIds.includes(m.userId));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {watcherIds.map((id) => {
        const m = memberMap.get(id);
        const label = m?.displayName ?? m?.email ?? id.slice(0, 8);
        return (
          <Badge key={id} variant="secondary" className="gap-1">
            {label}
            <button
              type="button"
              onClick={() => toggle.mutate({ taskId, userId: id, on: false })}
              className="rounded-full p-0.5 hover:bg-destructive/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      {eligible.length > 0 && (
        <Select onValueChange={(v) => toggle.mutate({ taskId, userId: v, on: true })}>
          <SelectTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="h-3 w-3" /> Watch
            </Button>
          </SelectTrigger>
          <SelectContent>
            {eligible.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>{m.displayName ?? m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `TaskPopout.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CommentThread } from '@/features/comments/CommentThread';
import { MentionInput } from './MentionInput';
import { AssigneePicker } from './AssigneePicker';
import { WatcherChips } from './WatcherChips';
import { useUpdateTask, useRecordMentions } from './useTasks';
import { toast } from '@/lib/toast';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }
];
const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' }, { value: 'next', label: 'Next' },
  { value: 'in_progress', label: 'In Progress' }, { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' }, { value: 'ignored', label: 'Ignored' }
];

export function TaskPopout({
  task, open, onOpenChange
}: { task: Task; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateTask();
  const recordMentions = useRecordMentions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setPendingMentions([]);
  }, [open, task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    update.mutate(
      {
        id: task.id,
        title,
        description: description || null,
        priority,
        status,
        expectedVersion: task.version
      },
      {
        onSuccess: async () => {
          if (pendingMentions.length > 0) {
            try {
              await recordMentions.mutateAsync({ taskId: task.id, userIds: pendingMentions, source: 'description' });
            } catch (e) { console.warn('[mentions]', e); }
          }
          toast.success('Task updated');
          onOpenChange(false);
        }
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Badge variant="outline" className="mr-2">{priority}</Badge>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="inline-block w-auto" />
          </DialogTitle>
          <DialogDescription>Edit task details, assignee, watchers, and comments.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Assignee</Label>
            <AssigneePicker
              value={task.assigneeUserId}
              onChange={(uid) => update.mutate({ id: task.id, assigneeUserId: uid, expectedVersion: task.version })}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Watchers</Label>
            <WatcherChips taskId={task.id} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Description (use @ to mention)</Label>
            <MentionInput
              value={description}
              onChange={setDescription}
              onMentionsChange={setPendingMentions}
              placeholder="Notes, context, or @mention a teammate"
            />
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <Label className="mb-1 block">Comments</Label>
          <CommentThread target="task" targetId={task.id} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Modify `TaskCard.tsx` to open popout on double-click**

In `TaskCard`, add at the top inside the component:
```tsx
const [popOpen, setPopOpen] = useState(false);
```
Wrap the existing `<Card>` with `onDoubleClick={() => setPopOpen(true)}`. After `</Card>`, render:
```tsx
<TaskPopout task={task} open={popOpen} onOpenChange={setPopOpen} />
```
Add import:
```tsx
import { TaskPopout } from './TaskPopout';
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/features/tasks/TaskPopout.tsx src/renderer/features/tasks/AssigneePicker.tsx src/renderer/features/tasks/WatcherChips.tsx src/renderer/features/tasks/MentionInput.tsx src/renderer/features/tasks/TaskCard.tsx
git commit -m "feat(tasks): popout modal w/ assignee, watchers, mentions, description"
```

---

# PHASE D — Edge function trash purge + cron

## Task D1: edge function `tasks-trash-purge`

**Files:**
- Create: `supabase/functions/tasks-trash-purge/index.ts`

- [ ] **Step 1: Function**

```ts
// Supabase Edge Function — invoked daily by pg_cron (0030_tasks_purge_cron.sql).
// Hard-deletes tasks whose deleted_at is older than 30 days.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${Deno.env.get('TASKS_PURGE_SECRET') ?? ''}`;
  if (!auth || auth !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await supabase
    .from('tasks')
    .delete({ count: 'exact' })
    .lt('deleted_at', cutoff);
  if (error) {
    console.error('[purge] error', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ purged: count ?? 0, cutoff }), {
    headers: { 'content-type': 'application/json' }
  });
});
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy tasks-trash-purge`
Expected: deployed.

- [ ] **Step 3: Set secret**

Generate a 64-hex random value (e.g. via `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and set it:
```
npx supabase secrets set TASKS_PURGE_SECRET=<value>
```
Save the value for the cron migration below.

- [ ] **Step 4: Smoke test**

Use any HTTP client (Postman, Insomnia, browser fetch) to POST to `https://<project-ref>.functions.supabase.co/tasks-trash-purge` with header `Authorization: Bearer <TASKS_PURGE_SECRET>`.
Expected: `200`, body `{"purged":0,"cutoff":"..."}` on first run.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/tasks-trash-purge/index.ts
git commit -m "feat(tasks): edge function tasks-trash-purge"
```

---

## Task D2: `0030_tasks_purge_cron` migration

**Files:**
- Create: `supabase/migrations/0030_tasks_purge_cron.sql`

- [ ] **Step 1: Migration**

```sql
-- Daily 04:15 UTC. Reads project_ref + tasks_purge_secret from Supabase Vault.
do $$ begin
  perform cron.unschedule('tasks-trash-purge-daily');
exception when others then null;
end $$;

select cron.schedule(
  'tasks-trash-purge-daily',
  '15 4 * * *',
  $$
  select net.http_post(
    url := 'https://' || (select decrypted_secret from vault.decrypted_secrets where name = 'project_ref') || '.functions.supabase.co/tasks-trash-purge',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'tasks_purge_secret')
    )
  ) as request_id;
  $$
);
```

- [ ] **Step 2: Add Vault secrets** (manual via Supabase dashboard → Database → Vault)

```
project_ref         = <project ref, e.g. abcdefghijkl>
tasks_purge_secret  = <same as TASKS_PURGE_SECRET>
```

- [ ] **Step 3: Apply**

Run: `npx supabase db push`
Verify: `select * from cron.job where jobname='tasks-trash-purge-daily';` returns one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0030_tasks_purge_cron.sql
git commit -m "feat(tasks): pg_cron registers daily trash purge"
```

---

# PHASE E — Realtime sanity

## Task E1: confirm tasks realtime works

**Files:** none (verification only)

- [ ] **Step 1: Confirm publication includes tasks**

Run in SQL editor:
```sql
select schemaname, tablename from pg_publication_tables
where pubname='supabase_realtime' and tablename in ('tasks','task_watchers','task_mentions','notifications');
```
Expected: tasks already there from earlier migrations; if not, run:
```sql
alter publication supabase_realtime add table public.tasks;
alter table public.tasks replica identity full;
```

- [ ] **Step 2: Manual smoke**

`pnpm dev`. Two windows signed in as user A and user B sharing a workspace.
- A creates task → B's board updates without refresh.
- A drags to Done → B sees move.
- A drags to trash → disappears for B; appears in B's TrashDock badge.
- A restores → reappears.
- A empties trash → B's TrashDock count drops to 0.

---

# PHASE F — Teams (new schema, backfill)

## Task F1: `0032_teams` migration

**Files:**
- Create: `supabase/migrations/0032_teams.sql`

- [ ] **Step 1: Migration**

```sql
-- Teams: groups of users within a workspace. Backfill creates a default
-- "Everyone" team per workspace containing all current members.
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index teams_workspace_idx on public.teams (workspace_id);

create table if not exists public.team_members (
  team_id    uuid not null references public.teams (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('lead','member')),
  joined_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy teams_select on public.teams for select
  using (public.is_workspace_member(workspace_id));

create policy teams_modify on public.teams for all
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

create policy team_members_select on public.team_members for select
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_member(t.workspace_id)
    )
  );

create policy team_members_modify on public.team_members for all
  using (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_writer(t.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.teams t
      where t.id = team_members.team_id
        and public.is_workspace_writer(t.workspace_id)
    )
  );

-- Backfill: one "Everyone" team per workspace, populated with every current member.
do $$
declare ws record; t_id uuid;
begin
  for ws in select id from public.workspaces loop
    insert into public.teams (workspace_id, name)
    values (ws.id, 'Everyone')
    on conflict (workspace_id, name) do update set name = excluded.name
    returning id into t_id;
    if t_id is null then
      select id into t_id from public.teams where workspace_id = ws.id and name = 'Everyone';
    end if;
    insert into public.team_members (team_id, user_id, role)
    select t_id, user_id, 'member' from public.workspace_members where workspace_id = ws.id
    on conflict do nothing;
  end loop;
end $$;

-- Trigger: auto-add new workspace members to "Everyone".
create or replace function public.tm_default_team_join() returns trigger as $$
declare t_id uuid;
begin
  select id into t_id from public.teams where workspace_id = new.workspace_id and name = 'Everyone';
  if t_id is null then
    insert into public.teams (workspace_id, name) values (new.workspace_id, 'Everyone') returning id into t_id;
  end if;
  insert into public.team_members (team_id, user_id, role)
  values (t_id, new.user_id, 'member') on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists workspace_members_default_team on public.workspace_members;
create trigger workspace_members_default_team
  after insert on public.workspace_members
  for each row execute function public.tm_default_team_join();

alter publication supabase_realtime add table public.teams;
alter publication supabase_realtime add table public.team_members;
```

- [ ] **Step 2: Apply + verify**

Run: `npx supabase db push`
Verify: `select count(*) from teams;` ≥ workspace count. `select count(*) from team_members;` ≥ workspace_members count.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0032_teams.sql
git commit -m "feat(teams): teams + team_members schema, RLS, default Everyone backfill"
```

---

## Task F2: teams data layer

**Files:**
- Create: `src/renderer/lib/data/teams.ts`

- [ ] **Step 1: Module**

```ts
import { getSupabase } from '@/lib/supabase';
import type { Team, TeamMember } from '@shared/types';

interface TeamRow { id: string; workspace_id: string; name: string; created_at: string; }
interface TeamMemberRow { team_id: string; user_id: string; role: 'lead' | 'member'; joined_at: string; }

export async function listTeams(workspaceId: string): Promise<Team[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('teams').select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamRow[]).map((r) => ({
    id: r.id, workspaceId: r.workspace_id, name: r.name, createdAt: r.created_at
  }));
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('team_members').select('*').eq('team_id', teamId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamMemberRow[]).map((r) => ({
    teamId: r.team_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at
  }));
}

export async function createTeam(workspaceId: string, name: string): Promise<Team> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('teams').insert({ workspace_id: workspaceId, name }).select('*').single();
  if (error) throw new Error(error.message);
  const r = data as TeamRow;
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, createdAt: r.created_at };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) throw new Error(error.message);
}

export async function addTeamMember(teamId: string, userId: string, role: 'lead' | 'member' = 'member'): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('team_members').insert({ team_id: teamId, user_id: userId, role });
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('team_members').delete()
    .eq('team_id', teamId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/lib/data/teams.ts
git commit -m "feat(teams): data layer for teams CRUD"
```

---

## Task F3: `useTeams` hooks

**Files:**
- Create: `src/renderer/features/teams/useTeams.ts`

- [ ] **Step 1: Module**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listTeams, listTeamMembers, createTeam, deleteTeam, addTeamMember, removeTeamMember } from '@/lib/data/teams';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';

const KEY = ['teams'] as const;

export function useTeamsList() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: [...KEY, wsId],
    queryFn: () => (wsId ? listTeams(wsId) : Promise.resolve([])),
    enabled: !!wsId
  });
}

export function useTeamMembersList(teamId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'members', teamId],
    queryFn: () => (teamId ? listTeamMembers(teamId) : Promise.resolve([])),
    enabled: !!teamId
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  const wsId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: (name: string) => {
      if (!wsId) throw new Error('No active workspace');
      return createTeam(wsId, name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useToggleTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, on }: { teamId: string; userId: string; on: boolean }) => {
      if (on) await addTeamMember(teamId, userId);
      else await removeTeamMember(teamId, userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/teams/useTeams.ts
git commit -m "feat(teams): useTeams hooks"
```

---

## Task F4: `TeamsCard` in workspace settings

**Files:**
- Create: `src/renderer/features/teams/TeamsCard.tsx`
- Modify: `src/renderer/routes/SettingsRoute.tsx` — render `<TeamsCard />` after workspace member card

- [ ] **Step 1: `TeamsCard.tsx`**

```tsx
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useTeamsList, useTeamMembersList, useCreateTeam, useDeleteTeam, useToggleTeamMember } from './useTeams';
import { useTaskMembers } from '@/features/tasks/useTaskMembers';
import { toast } from '@/lib/toast';

export function TeamsCard() {
  const [newName, setNewName] = useState('');
  const { data: teams = [] } = useTeamsList();
  const { data: members = [] } = useTaskMembers();
  const create = useCreateTeam();
  const del = useDeleteTeam();
  const toggle = useToggleTeamMember();
  const [active, setActive] = useState<string | null>(null);
  const { data: activeMembers = [] } = useTeamMembersList(active);
  const memberMap = new Map(members.map((m) => [m.userId, m]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Group workspace members. Use teams to scope task assignments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New team name"
            className="h-8"
          />
          <Button
            size="sm"
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate(newName.trim(), {
              onSuccess: () => { toast.success('Team created'); setNewName(''); }
            })}
          >
            <Plus className="mr-1 h-3 w-3" /> Create
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {teams.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm font-medium hover:underline"
                  onClick={() => setActive(active === t.id ? null : t.id)}
                >
                  {t.name}
                </button>
                {t.name !== 'Everyone' && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => del.mutate(t.id, { onSuccess: () => toast.success('Team deleted') })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {active === t.id && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {members.map((m) => {
                    const isMember = activeMembers.some((tm) => tm.userId === m.userId);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        className={`text-left rounded border px-2 py-1 text-xs ${isMember ? 'border-primary bg-primary/10' : 'border-border'}`}
                        onClick={() => toggle.mutate({ teamId: t.id, userId: m.userId, on: !isMember })}
                      >
                        {memberMap.get(m.userId)?.displayName ?? m.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Mount in `SettingsRoute.tsx`**

Locate the workspace member card in `SettingsRoute.tsx` and add:

```tsx
import { TeamsCard } from '@/features/teams/TeamsCard';
```

Render `<TeamsCard />` directly after the workspace member card, inside the same vertical stack.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/teams/TeamsCard.tsx src/renderer/routes/SettingsRoute.tsx
git commit -m "feat(teams): TeamsCard in settings"
```

---

# PHASE G — App-wide text style pass

## Task G1: codify type scale

**Files:**
- Create: `src/renderer/styles/typography.css`
- Modify: `src/renderer/index.css` — add import

- [ ] **Step 1: `typography.css`**

```css
/* App-wide type scale. Use these utility classes wherever possible.
   Menus stay legible (no smaller than 13px). */

@layer components {
  .t-h1 { @apply text-2xl font-semibold tracking-tight; }
  .t-h2 { @apply text-xl  font-semibold tracking-tight; }
  .t-h3 { @apply text-lg  font-medium; }
  .t-h4 { @apply text-base font-medium; }

  .t-body  { @apply text-sm; }
  .t-mono  { @apply font-mono text-sm; }
  .t-meta  { @apply text-xs text-muted-foreground; }
  .t-tiny  { @apply text-[11px] text-muted-foreground; }

  .t-menu        { @apply text-sm; }
  .t-menu-strong { @apply text-sm font-medium; }
  .t-label       { @apply text-sm font-medium; }
  .t-button      { @apply text-sm font-medium; }
}
```

- [ ] **Step 2: Wire import**

In `src/renderer/index.css`, after the `@tailwind` directives, add:
```css
@import './styles/typography.css';
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/typography.css src/renderer/index.css
git commit -m "feat(ui): codify app-wide typography scale (t-h1..t-tiny)"
```

---

## Task G2: sweep `routes/` and high-traffic features

**Files:** sweep — touch only when class strings clearly map.

- [ ] **Step 1: Page titles**

```bash
grep -rln "text-2xl font-semibold tracking-tight" src/renderer/routes src/renderer/features
```
For each match, replace `text-2xl font-semibold tracking-tight` with `t-h1` (preserve other classes on the element).

- [ ] **Step 2: Subtitles directly under page titles**

```bash
grep -rln "text-sm text-muted-foreground" src/renderer/routes src/renderer/features
```
Where the muted text is the SUBTITLE under a heading, replace `text-sm text-muted-foreground` with `t-meta`. Where it's mixed with content (inline metadata in a row), leave as-is.

- [ ] **Step 3: Sidebar legibility**

Audit `src/renderer/components/layout/Sidebar.tsx`. Anything currently `text-xs` should be `text-sm` (use `t-menu`). Workspace switcher header → `t-menu-strong`. Footer "Local User" tile uses `t-menu`.

- [ ] **Step 4: Card meta lines**

```bash
grep -rln 'text-xs text-muted-foreground' src/renderer/features
```
Convert to `t-meta` or `t-tiny` based on context. Avoid tiny text on interactive controls.

- [ ] **Step 5: Smoke**

Run `pnpm dev`. Walk through Dashboard, Tasks (now redesigned), Projects, Project Detail (Overview/Memory/Audits/Code Map/Scan), Settings, Chat. Look for:
- Headers consistently sized
- Sidebar legible (no smaller than 13px)
- No accidentally oversized body copy

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer
git commit -m "refactor(ui): sweep typography to t-h1/t-h2/t-meta utilities"
```

---

# PHASE H — Acceptance + scan-sync verify

## Task H1: TypeScript + tests + build

- [ ] **Step 1: Quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: green.

- [ ] **Step 2: Manual flow on single account**

`pnpm dev`. Verify:
- Open Tasks → board renders.
- Drag card between columns → status updates, persists across reload.
- Drag card to bottom-right TrashDock → toast "Sent to trash"; card disappears; TrashDock badge increments.
- Click TrashDock → drawer with item; click Restore → returns to original status.
- Empty Trash → confirms, clears.
- Double-click a task → popout opens; edit description; save → updated text persists; @mention a teammate → mention recorded (check `task_mentions` table).
- Filter "Assigned to me" / "Assigned to <user>" → list filters; URL updates with `?assignee=…`.

> **Note on restore destination:** restore returns the task to its previous status. Document in TaskCard tooltip if user expects otherwise.

---

## Task H2: scan sync 2-user manual checklist

**Files:**
- Create: `docs/QA/2026-05-06-scan-sync-2-user-checklist.md`

- [ ] **Step 1: Write the checklist**

```md
# Scan Sync 2-User Manual Verify (commit 595db53)

Goal: prove cloud-mirrored scan results are visible to teammates without re-running the scan.

## Setup
1. Two distinct Supabase auth users: A (owner) and B (editor).
2. A and B share workspace `WS-Test`.
3. A creates cloud project `Proj-Sync` (visibility: workspace).
4. Confirm B sees `Proj-Sync` in their project list.

## Steps as User A
1. Open `Proj-Sync` → Scan tab.
2. Click "Run scan". Wait for completion (status `completed`, file count > 0).
3. Inspect Supabase dashboard → Table Editor → `project_scans`. Confirm one row for the project, `summary` jsonb populated, `scanned_by = A`.
4. Inspect `project_scan_files` — file rows present (`scan_id` matches the scan).
5. Inspect `project_scan_env_vars` — env rows if any detected.

## Steps as User B
6. Sign out A. Sign in B.
7. Open `Proj-Sync` → Scan tab.
8. Confirm:
   - Primary stack matches what A saw.
   - File count matches.
   - Detected env vars list matches.
   - "Last scanned by" shows A's email.
   - "Last scanned at" timestamp matches.
9. Confirm B can NOT trigger a scan locally on a project that lives in A's checkout (cloud-only path is read-only for B).

## RLS sanity
10. As B, attempt direct read of `project_scans` for a project NOT in WS-Test:
    select id from project_scans where project_id = '<other-ws-project>';
    Expected: empty.

## Failure modes
- If B sees empty Scan tab: check `useScans` cloud branch returns the latest cloud row.
- If B sees stale data: invalidate query cache on focus.
- If B gets RLS error: confirm `is_project_visible` includes workspace_members shortcut for cloud projects.

## Result
- All steps pass on production env / staging env / local: yes / no
- Tested on date: ____________ by: ____________
```

- [ ] **Step 2: Commit**

```bash
git add docs/QA/2026-05-06-scan-sync-2-user-checklist.md
git commit -m "docs(qa): scan-sync 2-user verify checklist for commit 595db53"
```

- [ ] **Step 3: Run when a second test user is available** (user-driven; tick the boxes manually after testing)

---

## Task H3: tag

- [ ] **Step 1: Tag**

```bash
git tag -a phase-7-tasks-collab -m "Phase 7 complete: tasks DnD + trash + popout + assignee + filter + teams + text pass + scan-sync verify"
```

---

## Self-Review Notes

**Spec coverage:**
- [x] Drag-and-drop tasks across columns → Phase C2 (`TaskBoard` with `DndContext`).
- [x] Trashcan bottom-right → Phase C3 (`TrashDock` floating button + droppable).
- [x] 30-day retention then auto-delete → Phase D (edge function + cron).
- [x] Empty Trash → Phase C3 (`TrashView` "Empty Trash" button).
- [x] Realtime sync for everyone with project access → Phase E (`useWorkspaceTasksRealtime` already mounted; RLS gates visibility).
- [x] Visibility scoped to projects → Phase A1 RLS uses `is_project_visible` (already in 0009).
- [x] Double-click task → popout → Phase C6 (`TaskPopout`).
- [x] Add notes / updates / tag users → Phase C6 (description + `MentionInput` + `WatcherChips`).
- [x] Assign tasks → Phase C6 (`AssigneePicker`).
- [x] Notify on assign via bell + toast → Phase A3 trigger inserts notification; existing realtime in `NotificationBell` fires the toast.
- [x] Click notification → Tasks filtered to "Assigned to me" → notification `link='#/tasks?assignee=me'`; `TasksRoute` reads `?assignee` param.
- [x] Filter All / Assigned to me / Assigned to … → Phase C4 + C5 (`TaskFilterBar`).
- [x] Member picker scoped to workspace + (teams) → Phase B4 (workspace baseline) + Phase F (teams; cross-workspace project union deferred and documented).
- [x] Teams (multiple groups of people) → Phase F (`teams`, `team_members`, RLS, backfill, `TeamsCard`).
- [x] Uniform text app-wide → Phase G (`typography.css` + sweep).
- [x] Scan-sync verification → Phase H2 (manual 2-user checklist).

**Type consistency:**
- `Task.assigneeUserId` ↔ `assignee_user_id` consistent in `rowToTask` mapper.
- `softDeleteTask` ≠ `removeTask`: `removeTask` is the public alias used by existing UI; data layer aliases it to `softDeleteTask` so `useRemoveTask` keeps working.
- `useToggleWatcher` arg shape `{ taskId, userId, on }` matches `WatcherChips` and `TaskPopout` callsites.
- Migration numbering: A1=0027, A2=0028, A3=0029, D2=0030, F1=0032 (skip 0031 reserved for any realtime safety addon).

**Risks / known follow-ups (deliberately out of scope):**
- Cross-workspace member union in `useTaskMembers` — documented as future work.
- Restore returns task to its previous status (no `original_status` snapshot).
- Trash retention is exactly 30 days from `deleted_at`; no per-workspace override.
- Mention parser uses email-handle as the `@token`. If handles collide, first match wins. Future: switch to display-name fuzzy match.
- Description-side `recordMentions` runs after save; transient failure does not roll back the task save (intentional — don't lose user content).
