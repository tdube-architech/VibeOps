import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { Task, TaskInput, TaskListQuery, TaskPatch, TaskPriority, TaskStatus } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isCloud(id: string): boolean { return UUID_RE.test(id); }

interface TaskRow {
  id: string;
  project_id: string;
  workspace_id: string;
  source_finding_id: string | null;
  source_signature: string | null;
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
  position: number | null;
  version?: number;
}

export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor(public readonly entity: 'task' | 'finding' | 'project', message?: string) {
    super(message ?? `${entity} was modified by another user`);
  }
}

export function isConflictMessage(msg: string): boolean {
  return /VERSION_CONFLICT|P0012/.test(msg);
}

function rowToTask(row: TaskRow): Task {
  const t: Task = {
    id: row.id,
    projectId: row.project_id,
    sourceFindingId: row.source_finding_id,
    sourceSignature: row.source_signature,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    assigneeUserId: row.assignee_user_id,
    relatedFiles: row.related_files ?? [],
    suggestedPrompt: row.suggested_prompt,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
    position: row.position
  };
  if (row.version !== undefined) t.version = row.version;
  return t;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}

export async function listTasks(q: TaskListQuery & { workspaceId?: string; cloudOnly?: boolean }): Promise<Task[]> {
  const supabase = getSupabase();
  if (q.projectId && !isCloud(q.projectId)) return api.tasks.list(q);

  let query = supabase.from('tasks').select('*')
    .order('position', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
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

export async function getTask(id: string): Promise<Task | null> {
  if (!isCloud(id)) return api.tasks.get(id);
  const supabase = getSupabase();
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToTask(data as TaskRow) : null;
}

export async function createTask(
  input: TaskInput, workspaceId: string
): Promise<Task> {
  // Cloud project → cloud task. Else local IPC.
  if (!isCloud(input.projectId)) return api.tasks.create(input);
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const row: Record<string, unknown> = {
    project_id: input.projectId,
    workspace_id: workspaceId,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    status: 'backlog' as TaskStatus,
    related_files: input.relatedFiles ?? [],
    suggested_prompt: input.suggestedPrompt ?? null,
    source_finding_id: input.sourceFindingId ?? null,
    source_signature: input.sourceSignature ?? null,
    created_by: userId
  };
  const { data, error } = await supabase.from('tasks').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return rowToTask(data as TaskRow);
}

export async function createTaskFromFinding(findingId: string): Promise<Task> {
  if (!isCloud(findingId)) return api.tasks.createFromFinding(findingId);
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const { data: finding, error: fErr } = await supabase
    .from('audit_findings')
    .select('id, project_id, workspace_id, severity, title, description, file_path, recommendation, suggested_prompt')
    .eq('id', findingId)
    .single();
  if (fErr) throw new Error(fErr.message);
  const f = finding as {
    id: string; project_id: string; workspace_id: string;
    severity: string; title: string; description: string | null;
    file_path: string | null; recommendation: string | null; suggested_prompt: string | null;
  };
  const priority: TaskPriority = (
    f.severity === 'critical' ? 'critical'
      : f.severity === 'high' ? 'high'
      : f.severity === 'medium' ? 'medium'
      : 'low'
  );
  const row: Record<string, unknown> = {
    project_id: f.project_id,
    workspace_id: f.workspace_id,
    source_finding_id: f.id,
    source_signature: null,
    title: f.title,
    description: [f.description, f.recommendation ? `\n\n**Recommendation:** ${f.recommendation}` : ''].filter(Boolean).join(''),
    priority,
    status: 'backlog' as TaskStatus,
    related_files: f.file_path ? [f.file_path] : [],
    suggested_prompt: f.suggested_prompt,
    created_by: userId
  };
  const { data, error } = await supabase.from('tasks').insert(row).select('*').single();
  if (error) throw new Error(error.message);
  return rowToTask(data as TaskRow);
}

export async function updateTask(patch: TaskPatch & { expectedVersion?: number }): Promise<Task> {
  if (!isCloud(patch.id)) return api.tasks.update(patch);
  const supabase = getSupabase();

  if (patch.expectedVersion === undefined) {
    // Fall back to a non-versioned update if caller didn't pass version
    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.priority !== undefined) update.priority = patch.priority;
    if (patch.status !== undefined) {
      update.status = patch.status;
      update.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
    }
    if (patch.relatedFiles !== undefined) update.related_files = patch.relatedFiles;
    if (patch.suggestedPrompt !== undefined) update.suggested_prompt = patch.suggestedPrompt;
    if (patch.assigneeUserId !== undefined) update.assignee_user_id = patch.assigneeUserId;
    if (patch.position !== undefined) update.position = patch.position;
    const { data, error } = await supabase
      .from('tasks').update(update).eq('id', patch.id)
      .select('*').single();
    if (error) throw new Error(error.message);
    return rowToTask(data as TaskRow);
  }

  const patchObj: Record<string, unknown> = {};
  if (patch.title !== undefined) patchObj.title = patch.title;
  if (patch.description !== undefined) patchObj.description = patch.description;
  if (patch.priority !== undefined) patchObj.priority = patch.priority;
  if (patch.status !== undefined) patchObj.status = patch.status;
  if (patch.relatedFiles !== undefined) patchObj.related_files = patch.relatedFiles;
  if (patch.suggestedPrompt !== undefined) patchObj.suggested_prompt = patch.suggestedPrompt;
  if (patch.assigneeUserId !== undefined) patchObj.assignee_user_id = patch.assigneeUserId;
  if (patch.position !== undefined) patchObj.position = patch.position;

  const { data, error } = await supabase.rpc('update_task_versioned', {
    task_id: patch.id,
    expected_version: patch.expectedVersion,
    patch: patchObj
  });
  if (error) {
    if (isConflictMessage(error.message)) throw new VersionConflictError('task', error.message);
    throw new Error(error.message);
  }
  return rowToTask(data as TaskRow);
}

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

export async function hardDeleteTask(id: string): Promise<void> {
  if (!isCloud(id)) { await api.tasks.remove(id); return; }
  const supabase = getSupabase();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function removeTask(id: string): Promise<void> {
  return softDeleteTask(id);
}

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
