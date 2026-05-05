import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWorkspace as svcCreate,
  listWorkspaces,
  removeWorkspace as svcRemove,
  renameWorkspace as svcRename,
  ensureDefaultWorkspace
} from '@/lib/data/workspaces';
import { api } from '@/lib/api';
import { useSettings } from '@/features/settings/useSettings';
import { useAuth } from '@/features/auth/useAuth';
import type { Workspace, WorkspaceInput } from '@shared/types';

const KEY = ['workspaces'] as const;

export function useWorkspaceList() {
  const { state } = useAuth();
  return useQuery({
    queryKey: KEY,
    queryFn: () => listWorkspaces(),
    enabled: state?.status === 'authenticated'
  });
}

export function useEnsureDefaultWorkspace() {
  const { state } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (state?.status !== 'authenticated' || !state.user) return;
    let cancelled = false;
    (async () => {
      try {
        const label = state.user!.email?.split('@')[0] ?? 'My';
        const ws = await ensureDefaultWorkspace(label);
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: KEY });
        const settings = await api.settings.read();
        const list = await listWorkspaces();
        const activeStillValid = settings.workspaces.activeWorkspaceId
          && list.some((w: Workspace) => w.id === settings.workspaces.activeWorkspaceId);
        if (!activeStillValid) {
          await api.workspaces.setActive(ws.id);
          qc.invalidateQueries({ queryKey: ['settings'] });
        }
      } catch {
        // soft-fail
      }
    })();
    return () => { cancelled = true; };
  }, [state?.status, state?.user?.id, qc]);
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
    mutationFn: (input: WorkspaceInput) => svcCreate(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRenameWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => svcRename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useRemoveWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => svcRemove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
