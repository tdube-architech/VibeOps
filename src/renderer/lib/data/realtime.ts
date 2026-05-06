import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Subscribe to workspace-wide task changes. Mounted high up so kanban
 * + dashboard refresh whenever any teammate moves a task.
 */
export function useWorkspaceTasksRealtime(workspaceId: string | null | undefined): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!workspaceId || !UUID_RE.test(workspaceId)) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ws-tasks-${workspaceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` },
        () => { qc.invalidateQueries({ queryKey: ['tasks'] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [workspaceId, qc]);
}

/**
 * Subscribe to audit_runs + audit_findings + tasks events for a single
 * cloud project. Invalidates relevant React Query caches on any change.
 * No-op for legacy local IDs.
 */
export function useProjectRealtime(projectId: string | undefined): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!projectId || !UUID_RE.test(projectId)) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`project-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'audit_runs', filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['audits', projectId] });
          qc.invalidateQueries({ queryKey: ['audits', projectId, 'latest'] });
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'audit_findings', filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['audits', projectId, 'latest'] });
          qc.invalidateQueries({ queryKey: ['audits', 'findings'] });
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['projects'] });
          qc.invalidateQueries({ queryKey: ['projects', projectId] });
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'memory_versions', filter: `project_id=eq.${projectId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['memory', projectId, 'versions'] });
          qc.invalidateQueries({ queryKey: ['memory', projectId, 'latest'] });
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, qc]);
}
