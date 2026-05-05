import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { pushScanCompleted } from '@/lib/data/sync-progress';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';
import type { ScanProgressEvent } from '@shared/scan-events';

const scansKey = (projectId: string) => ['scans', projectId] as const;
const latestKey = (projectId: string) => ['scans', projectId, 'latest'] as const;
const filesKey = (scanId: string) => ['scan-files', scanId] as const;
const envVarsKey = (scanId: string) => ['scan-envs', scanId] as const;

export function useScanList(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? scansKey(projectId) : ['scans', '__none__'],
    queryFn: () => (projectId ? api.scans.list(projectId) : Promise.resolve<Scan[]>([])),
    enabled: !!projectId
  });
}

export function useLatestScan(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? latestKey(projectId) : ['scans', '__none__', 'latest'],
    queryFn: () => (projectId ? api.scans.latest(projectId) : Promise.resolve<Scan | null>(null)),
    enabled: !!projectId
  });
}

export function useScanFiles(scanId: string | undefined) {
  return useQuery({
    queryKey: scanId ? filesKey(scanId) : ['scan-files', '__none__'],
    queryFn: () => (scanId ? api.scans.files(scanId) : Promise.resolve<ScanFile[]>([])),
    enabled: !!scanId
  });
}

export function useScanEnvVars(scanId: string | undefined) {
  return useQuery({
    queryKey: scanId ? envVarsKey(scanId) : ['scan-envs', '__none__'],
    queryFn: () => (scanId ? api.scans.envVars(scanId) : Promise.resolve<ScanEnvVar[]>([])),
    enabled: !!scanId
  });
}

export function useStartScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (project: { id: string; localPath: string; name: string }) =>
      api.scans.start(project.id, { localPath: project.localPath, name: project.name }),
    onSuccess: async (scan, project) => {
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
