import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import {
  addProject, archiveProject, checkPathExists, getProject, listProjectsMerged,
  removeProject, unarchiveProject, updateProject
} from '@/lib/data/projects';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch } from '@shared/types';

const PROJECTS_KEY = ['projects'] as const;
const projectKey = (id: string) => ['projects', id] as const;

function isUuid(s: string | null | undefined): boolean {
  return !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function useProjectList(q: ProjectListQuery = {}) {
  const wsId = useActiveWorkspaceId();
  const { state } = useAuth();
  const wsIdValid = isUuid(wsId);
  const merged: ProjectListQuery & { workspaceId?: string } = { ...q, ...(wsIdValid && wsId ? { workspaceId: wsId } : {}) };
  return useQuery({
    queryKey: [...PROJECTS_KEY, 'list', merged],
    queryFn: () => listProjectsMerged(merged),
    enabled: state?.status === 'authenticated' && wsIdValid
  });
}

export function useProject(id: string | undefined) {
  const { state } = useAuth();
  return useQuery({
    queryKey: id ? projectKey(id) : ['projects', '__none__'],
    queryFn: () => (id ? getProject(id) : Promise.resolve(null)),
    enabled: !!id && state?.status === 'authenticated'
  });
}

export function useAddProject() {
  const qc = useQueryClient();
  const wsId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: ({ input, allowDuplicate }: { input: ProjectInput; allowDuplicate?: boolean }) => {
      if (!isUuid(wsId)) throw new Error('Active workspace not yet ready — try again in a moment.');
      return addProject(input, wsId!, allowDuplicate);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation<Project, Error, ProjectPatch>({
    mutationFn: (patch) => updateProject(patch),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.setQueryData(projectKey(p.id), p);
    }
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useUnarchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unarchiveProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useRemoveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY })
  });
}

export function useCheckPath() {
  const wsId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: (path: string) => {
      if (!wsId) throw new Error('No active workspace');
      return checkPathExists(path, wsId);
    }
  });
}
