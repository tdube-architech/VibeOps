import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AuditRun, AuditFinding, GeneratedPrompt } from '@shared/types';

const auditsKey = (projectId: string) => ['audits', projectId] as const;
const latestKey = (projectId: string) => ['audits', projectId, 'latest'] as const;
const promptsKey = (projectId: string) => ['prompts', projectId] as const;

export function useAuditList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? auditsKey(projectId) : ['audits', '__none__'],
    queryFn: () => (projectId ? api.audits.list(projectId) : Promise.resolve<AuditRun[]>([])),
    enabled: !!projectId
  });
}

export function useLatestAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['audits', '__none__', 'latest'],
    queryFn: () => (projectId ? api.audits.latest(projectId) : Promise.resolve<AuditRun | null>(null)),
    enabled: !!projectId
  });
}

export function useStartAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: { id: string; localPath: string; name: string }) =>
      api.audits.start(project.id, undefined, { localPath: project.localPath, name: project.name }),
    onSuccess: (_run, project) => {
      qc.invalidateQueries({ queryKey: auditsKey(project.id) });
      qc.invalidateQueries({ queryKey: latestKey(project.id) });
      qc.invalidateQueries({ queryKey: promptsKey(project.id) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}

export function useUpdateFinding() {
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AuditFinding['status'] }) =>
      api.audits.updateFinding(id, status)
  });
}

export function usePrompts(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? promptsKey(projectId) : ['prompts', '__none__'],
    queryFn: () => (projectId ? api.prompts.list(projectId) : Promise.resolve<GeneratedPrompt[]>([])),
    enabled: !!projectId
  });
}

export function useUpdatePrompt() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null } }) =>
      api.prompts.update(id, patch)
  });
}
