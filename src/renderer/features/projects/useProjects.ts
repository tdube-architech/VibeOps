import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch } from '@shared/types';

const PROJECTS_KEY = ['projects'] as const;
const projectKey = (id: string) => ['projects', id] as const;

export function useProjectList(q: ProjectListQuery = {}) {
  const wsId = useActiveWorkspaceId();
  const merged: ProjectListQuery = { ...q, ...(wsId ? { workspaceId: wsId } : {}) };
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', merged],
    queryFn: () => api.projects.list(merged)
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: id ? projectKey(id) : ['projects', '__none__'],
    queryFn: () => (id ? api.projects.get(id) : Promise.resolve(null)),
    enabled: !!id
  });
}

export function useAddProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, allowDuplicate }: { input: ProjectInput; allowDuplicate?: boolean }) =>
      api.projects.add(input, allowDuplicate),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectPatch>({
    mutationFn: (patch) => api.projects.update(patch),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.setQueryData(projectKey(p.id), p);
    }
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.archive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUnarchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.unarchive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useRemoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}
