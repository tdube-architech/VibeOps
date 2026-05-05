import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { addProject } from '@/lib/data/projects';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import type { Project } from '@shared/types';

export interface MigrateProgress {
  done: number;
  total: number;
  current: string | null;
  errors: Array<{ id: string; name: string; message: string }>;
  finished: boolean;
}

export function useMigrationStatus() {
  const { state } = useAuth();
  const [unmigrated, setUnmigrated] = useState<Project[] | null>(null);
  const [skippedAt, setSkippedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (state?.status !== 'authenticated') {
      setUnmigrated([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.migrate.status();
      setUnmigrated(res.unmigrated);
      setSkippedAt(res.skippedAt);
    } finally {
      setLoading(false);
    }
  }, [state?.status]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { unmigrated, skippedAt, loading, refresh };
}

export function useRunMigration() {
  const wsId = useActiveWorkspaceId();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<MigrateProgress | null>(null);

  const run = useCallback(async (projects: Project[]) => {
    if (!wsId) throw new Error('No active workspace');
    const errors: MigrateProgress['errors'] = [];
    setProgress({ done: 0, total: projects.length, current: null, errors: [], finished: false });
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      setProgress((prev) => prev && { ...prev, current: p.name, done: i });
      try {
        const input: import('@shared/types').ProjectInput = {
          name: p.name,
          localPath: p.localPath,
          status: p.status,
          tags: p.tags
        };
        if (p.description) input.description = p.description;
        if (p.category) input.category = p.category;
        if (p.repoUrl) input.repoUrl = p.repoUrl;
        const created = await addProject(input, wsId, true);
        await api.migrate.mark(p.id, created.id);
      } catch (e) {
        errors.push({ id: p.id, name: p.name, message: (e as Error).message });
      }
    }
    setProgress({
      done: projects.length,
      total: projects.length,
      current: null,
      errors,
      finished: true
    });
    qc.invalidateQueries({ queryKey: ['projects'] });
    return errors;
  }, [wsId, qc]);

  return { progress, run };
}
