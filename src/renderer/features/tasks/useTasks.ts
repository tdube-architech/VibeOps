import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import {
  createTask, createTaskFromFinding, listTasks, removeTask, updateTask, VersionConflictError
} from '@/lib/data/tasks';
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
