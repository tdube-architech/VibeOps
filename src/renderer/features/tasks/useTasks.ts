import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Task, TaskInput, TaskListQuery, TaskPatch } from '@shared/types';

const KEY = ['tasks'] as const;

export function useTaskList(q: TaskListQuery = {}) {
  return useQuery({
    queryKey: [...KEY, 'list', q],
    queryFn: () => api.tasks.list(q)
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) => api.tasks.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useCreateTaskFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) => api.tasks.createFromFinding(findingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, TaskPatch>({
    mutationFn: (patch) => api.tasks.update(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRemoveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.tasks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
