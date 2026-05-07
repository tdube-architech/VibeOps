import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pushScanCompleted } from '@/lib/data/sync-progress';
import {
  latestCloudScanHeader, listCloudScans, listCloudScanFiles, listCloudScanEnvVars,
  publishScanResult
} from '@/lib/data/scans';
import { toast } from '@/lib/toast';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import type { ScanProgressEvent } from '@shared/scan-events';

const scansKey = (projectId: string) => ['scans', projectId] as const;
const latestKey = (projectId: string) => ['scans', projectId, 'latest'] as const;
const filesKey = (scanId: string) => ['scan-files', scanId] as const;
const envVarsKey = (scanId: string) => ['scan-envs', scanId] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isCloud = (id: string): boolean => UUID_RE.test(id);

export function useScanList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? scansKey(projectId) : ['scans', '__none__'],
    queryFn: () => {
      if (!projectId) return Promise.resolve<Scan[]>([]);
      return isCloud(projectId) ? listCloudScans(projectId) : api.scans.list(projectId);
    },
    enabled: !!projectId
  });
}

export function useLatestScan(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['scans', '__none__', 'latest'],
    queryFn: () => {
      if (!projectId) return Promise.resolve<Scan | null>(null);
      return isCloud(projectId) ? latestCloudScanHeader(projectId) : api.scans.latest(projectId);
    },
    enabled: !!projectId
  });
}

export function useScanFiles(scanId: string | undefined, projectId?: string) {
  return useQuery({
    queryKey: scanId ? filesKey(scanId) : ['scan-files', '__none__'],
    queryFn: () => {
      if (!scanId) return Promise.resolve<ScanFile[]>([]);
      if (isCloud(scanId) && projectId) return listCloudScanFiles(projectId, scanId);
      return api.scans.files(scanId);
    },
    enabled: !!scanId
  });
}

export function useScanEnvVars(scanId: string | undefined, projectId?: string) {
  return useQuery({
    queryKey: scanId ? envVarsKey(scanId) : ['scan-envs', '__none__'],
    queryFn: () => {
      if (!scanId) return Promise.resolve<ScanEnvVar[]>([]);
      if (isCloud(scanId) && projectId) return listCloudScanEnvVars(projectId, scanId);
      return api.scans.envVars(scanId);
    },
    enabled: !!scanId
  });
}

export function useStartScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: { id: string; localPath: string; name: string; workspaceId?: string }) =>
      api.scans.start(project.id, { localPath: project.localPath, name: project.name }),
    onSuccess: async (scan, project) => {
      // Mirror the result to Supabase for cloud projects so workspace teammates
      // see the scan output without re-running. Local scan IDs (cuid) are
      // non-UUID, so the publish helper's isCloud(projectId) check short-circuits
      // for legacy projects.
      if (isCloud(project.id)) {
        try {
          // Pull files + env vars from local SQLite (the scan that just finished).
          const [files, envVars] = await Promise.all([
            api.scans.files(scan.id),
            api.scans.envVars(scan.id)
          ]);
          await publishScanResult(project.id, project.workspaceId, scan, files, envVars);
        } catch (e) {
          console.warn('[scan] publish to server failed', e);
          if (project.workspaceId) {
            toast.error(
              'Scan not shared',
              `Scan finished locally but upload failed: ${(e as Error).message}. Teammates won't see it until you re-run.`
            );
          }
        }
      }
      try {
        await pushScanCompleted(
          project.id,
          scan.completedAt ?? new Date().toISOString(),
          project.localPath,
          scan.detection?.primaryStack ?? null
        );
      } catch {
        // soft-fail; local stub still has the timestamp
      }
      qc.invalidateQueries({ queryKey: scansKey(project.id) });
      qc.invalidateQueries({ queryKey: latestKey(project.id) });
      qc.invalidateQueries({ queryKey: ['projects', project.id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  });
}

export function useScanProgress(projectId: string | undefined): ScanProgressEvent | null {
  const [evt, setEvt] = useState<ScanProgressEvent | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const off = api.scans.onProgress((e) => {
      if (e.projectId === projectId) setEvt(e);
    });
    return off;
  }, [projectId]);
  return evt;
}
