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

export function useMigrateOne() {
  const wsId = useActiveWorkspaceId();
  const qc = useQueryClient();
  return async (p: Project): Promise<{ ok: true; serverId: string } | { ok: false; message: string }> => {
    const isUuid = !!wsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wsId);
    if (!isUuid) return { ok: false, message: 'No active workspace yet — try again in a moment.' };
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
      const created = await addProject(input, wsId!, true);
      await api.migrate.mark(p.id, created.id);
      qc.invalidateQueries({ queryKey: ['projects'] });
      return { ok: true, serverId: created.id };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  };
}

export function useRunMigration() {
  const wsId = useActiveWorkspaceId();
  const qc = useQueryClient();
  const [progress, setProgress] = useState<MigrateProgress | null>(null);

  const run = useCallback(async (projects: Project[]) => {
    console.info('[migrate] run start', { count: projects.length, wsId });
    const errors: MigrateProgress['errors'] = [];
    const isUuid = !!wsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wsId);
    if (!isUuid) {
      const msg = 'No active workspace yet — try again in a moment.';
      console.error('[migrate]', msg);
      setProgress({ done: 0, total: projects.length, current: null, errors: [{ id: '-', name: 'workspace', message: msg }], finished: true });
      return [{ id: '-', name: 'workspace', message: msg }];
    }
    setProgress({ done: 0, total: projects.length, current: null, errors: [], finished: false });
    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      console.info('[migrate]', i + 1, '/', projects.length, '→', p.name);
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
        console.info('[migrate] inserted', p.name, '→', created.id);
        await api.migrate.mark(p.id, created.id);
      } catch (e) {
        const message = (e as Error).message ?? String(e);
        console.error('[migrate] failed', p.name, message, e);
        errors.push({ id: p.id, name: p.name, message });
      }
    }
    console.info('[migrate] done', { errors: errors.length });
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
