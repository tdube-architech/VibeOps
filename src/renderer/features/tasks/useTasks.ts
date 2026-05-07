import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import { getSupabase } from '@/lib/supabase';
import {
  addTaskWatcher,
  createTask, createTaskFromFinding,
  emptyTrash as svcEmptyTrash,
  listTasks,
  listTaskWatchers,
  recordTaskMentions,
  removeTask,
  removeTaskWatcher,
  restoreTask as svcRestore,
  softDeleteTask as svcSoftDelete,
  updateTask, VersionConflictError
} from '@/lib/data/tasks';
import { getTaskCommentSummary, markTaskCommentsRead, type TaskCommentSummary } from '@/lib/data/comments';
import { toast } from '@/lib/toast';
import type { Task, TaskInput, TaskListQuery, TaskPatch } from '@shared/types';

const KEY = ['tasks'] as const;
const isUuid = (s: string | null | undefined): boolean =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function useTaskList(q: TaskListQuery = {}) {
  const wsId = useActiveWorkspaceId();
  const merged: TaskListQuery & { workspaceId?: string } = { ...q };
  if (isUuid(wsId) && wsId) merged.workspaceId = wsId;
  return useQuery({
    queryKey: [...KEY, 'list', merged],
    queryFn: () => listTasks(merged)
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const wsId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: (input: TaskInput) => createTask(input, wsId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useCreateTaskFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => createTaskFromFinding(findingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

type UpdateTaskInput = TaskPatch & { expectedVersion?: number | undefined };

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, UpdateTaskInput>({
    mutationFn: (patch) => {
      const { expectedVersion, ...rest } = patch;
      const arg: TaskPatch & { expectedVersion?: number } = rest;
      if (expectedVersion !== undefined) arg.expectedVersion = expectedVersion;
      return updateTask(arg);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => {
      if (e instanceof VersionConflictError) {
        toast.error('Task was just updated by another user', 'Refreshing latest…');
        qc.invalidateQueries({ queryKey: KEY });
      }
    }
  });
}

export function useRemoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useTrashList() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: [...KEY, 'trash', wsId],
    queryFn: () => {
      const q: TaskListQuery & { workspaceId?: string } = { trashOnly: true };
      if (isUuid(wsId) && wsId) q.workspaceId = wsId;
      return listTasks(q);
    },
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

const SUMMARY_KEY = ['tasks', 'comment-summary'] as const;

export function useTaskCommentSummary() {
  const { state } = useAuth();
  const qc = useQueryClient();
  const enabled = state?.status === 'authenticated';

  const query = useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: async (): Promise<Map<string, TaskCommentSummary>> => {
      const rows = await getTaskCommentSummary();
      return new Map(rows.map((r) => [r.taskId, r]));
    },
    enabled
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel('comments-task-summary')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: 'target_type=eq.task' },
        () => qc.invalidateQueries({ queryKey: SUMMARY_KEY }))
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comment_reads' },
        () => qc.invalidateQueries({ queryKey: SUMMARY_KEY }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [enabled, qc]);

  return query;
}

export function useMarkTaskCommentsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => markTaskCommentsRead(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: SUMMARY_KEY })
  });
}
