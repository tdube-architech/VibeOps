import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Memory, MemoryDraft, MemorySource } from '@shared/types';

const versionsKey = (projectId: string) => ['memory', projectId, 'versions'] as const;
const latestKey = (projectId: string) => ['memory', projectId, 'latest'] as const;
const fileStatusKey = (projectId: string) => ['memory', projectId, 'fileStatus'] as const;

export function useMemoryVersions(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? versionsKey(projectId) : ['memory', '__none__'],
    queryFn: () => (projectId ? api.memory.listVersions(projectId) : Promise.resolve<Memory[]>([])),
    enabled: !!projectId
  });
}

export function useLatestMemory(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['memory', '__none__', 'latest'],
    queryFn: () => (projectId ? api.memory.getLatest(projectId) : Promise.resolve<Memory | null>(null)),
    enabled: !!projectId
  });
}

export function useMemoryFileStatus(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? fileStatusKey(projectId) : ['memory', '__none__', 'fileStatus'],
    queryFn: () => (projectId ? api.memory.fileStatus(projectId) : Promise.resolve(null)),
    enabled: !!projectId
  });
}

export function useGenerateDraft() {
  return useMutation({
    mutationFn: ({ projectId, mode, version, localPath, name }: {
      projectId: string;
      mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version';
      version?: number;
      localPath?: string;
      name?: string;
    }) =>
      api.memory.generateDraft(projectId, mode ?? 'fresh', version,
        (localPath && name) ? { localPath, name } : undefined)
  });
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, content, source }: { projectId: string; content: string; source?: MemorySource }) =>
      api.memory.saveDraft(projectId, content, source ?? 'user-edited'),
    onSuccess: (_m, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: latestKey(vars.projectId) });
    }
  });
}

export function useWriteMemoryFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, memoryId, localPath, name }: {
      projectId: string;
      memoryId: string;
      localPath?: string;
      name?: string;
    }) =>
      api.memory.writeFile(projectId, memoryId,
        (localPath && name) ? { localPath, name } : undefined),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: versionsKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: latestKey(vars.projectId) });
      qc.invalidateQueries({ queryKey: fileStatusKey(vars.projectId) });
    }
  });
}

export function useOpenMemoryInEditor() {
  return useMutation({
    mutationFn: (projectId: string) => api.memory.openInEditor(projectId)
  });
}

export type { Memory, MemoryDraft };
