import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pushAuditCompleted } from '@/lib/data/sync-progress';
import {
  AuditInFlightError, fetchInFlightAudit, FindingConflictError,
  latestAudit, listAudits, listFindings, publishAuditRun, updateFindingStatus
} from '@/lib/data/audits';
import { toast } from '@/lib/toast';
import type { AuditRun, AuditFinding, GeneratedPrompt } from '@shared/types';

const auditsKey = (projectId: string) => ['audits', projectId] as const;
const latestKey = (projectId: string) => ['audits', projectId, 'latest'] as const;
const findingsKey = (auditRunId: string) => ['audits', 'findings', auditRunId] as const;
const promptsKey = (projectId: string) => ['prompts', projectId] as const;
const inFlightKey = (projectId: string) => ['audits', projectId, 'in-flight'] as const;

export function useInFlightAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? inFlightKey(projectId) : ['audits', '__none__', 'in-flight'],
    queryFn: () => (projectId ? fetchInFlightAudit(projectId) : Promise.resolve(null)),
    enabled: !!projectId,
    refetchInterval: 30_000
  });
}

export function useAuditList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? auditsKey(projectId) : ['audits', '__none__'],
    queryFn: () => (projectId ? listAudits(projectId) : Promise.resolve<AuditRun[]>([])),
    enabled: !!projectId
  });
}

export function useLatestAudit(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['audits', '__none__', 'latest'],
    queryFn: () => (projectId ? latestAudit(projectId) : Promise.resolve<AuditRun | null>(null)),
    enabled: !!projectId
  });
}

export function useFindings(auditRunId: string | undefined) {
  return useQuery({
    queryKey: auditRunId ? findingsKey(auditRunId) : ['audits', 'findings', '__none__'],
    queryFn: () => (auditRunId ? listFindings(auditRunId) : Promise.resolve<AuditFinding[]>([])),
    enabled: !!auditRunId
  });
}

export function useStartAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: { id: string; localPath: string; name: string; workspaceId?: string }) =>
      api.audits.start(project.id, undefined, { localPath: project.localPath, name: project.name }),
    onSuccess: async (run, project) => {
      try {
        const target = project.workspaceId
          ? { id: project.id, workspaceId: project.workspaceId }
          : { id: project.id };
        await publishAuditRun(run, target);
      } catch (e) {
        console.warn('[audit] publish to server failed', e);
        if (project.workspaceId) {
          toast.error(
            'Audit not shared',
            `Run finished locally but upload failed: ${(e as Error).message}. Teammates won't see it until you re-publish.`
          );
        }
      }
      try {
        await pushAuditCompleted(project.id, run.completedAt ?? new Date().toISOString());
      } catch {
        // soft-fail
      }
      qc.invalidateQueries({ queryKey: auditsKey(project.id) });
      qc.invalidateQueries({ queryKey: latestKey(project.id) });
      qc.invalidateQueries({ queryKey: promptsKey(project.id) });
      qc.invalidateQueries({ queryKey: inFlightKey(project.id) });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (e) => {
      if (e instanceof AuditInFlightError) {
        const who = e.runBy ? `by ${e.runBy}` : 'by another user';
        toast.error('Audit already running', `Started ${who} — wait for it to complete.`);
      }
    }
  });
}

export function useUpdateFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, expectedVersion }: { id: string; status: AuditFinding['status']; expectedVersion?: number | undefined }) => {
      const arg: { id: string; status: AuditFinding['status']; expectedVersion?: number } = { id, status };
      if (expectedVersion !== undefined) arg.expectedVersion = expectedVersion;
      return updateFindingStatus(arg);
    },
    onSuccess: (f) => {
      if (f) qc.invalidateQueries({ queryKey: findingsKey(f.auditRunId) });
    },
    onError: (e) => {
      if (e instanceof FindingConflictError) {
        toast.error('Finding was just updated by another user', 'Refreshing latest…');
        qc.invalidateQueries({ queryKey: ['audits'] });
      }
    }
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
