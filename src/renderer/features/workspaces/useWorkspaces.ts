import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSettings } from '@/features/settings/useSettings';
import type { WorkspaceInput } from '@shared/types';

const KEY = ['workspaces'] as const;

export function useWorkspaceList() {
  return useQuery({ queryKey: KEY, queryFn: () => api.workspaces.list() });
}

export function useActiveWorkspaceId(): string | null {
  const { data: settings } = useSettings();
  return settings?.workspaces.activeWorkspaceId ?? null;
}

export function useSetActiveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.workspaces.setActive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorkspaceInput) => api.workspaces.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.workspaces.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRemoveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.workspaces.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
