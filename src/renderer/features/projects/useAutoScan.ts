import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@shared/types';
import { useStartScan } from './useScans';
import { decideAutoScan } from './autoScanPolicy';

const IN_FLIGHT_RE = /already running|in.?flight|in progress/i;

export function useAutoScan(project: Project | undefined): void {
  const qc = useQueryClient();
  const startScan = useStartScan();
  const lastAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    const decision = decideAutoScan({
      project,
      lastAttemptedId: lastAttemptedRef.current,
      now: Date.now()
    });
    if (decision.action !== 'trigger') return;
    if (!project) return;

    lastAttemptedRef.current = project.id;
    qc.invalidateQueries({ queryKey: ['git-info', project.id] });

    startScan.mutate(
      {
        id: project.id,
        localPath: project.localPath,
        name: project.name,
        workspaceId: project.workspaceId
      },
      {
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (IN_FLIGHT_RE.test(msg)) return;
          console.warn('[auto-scan] failed', msg);
        }
      }
    );
  }, [project, qc, startScan]);
}
