import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { UpdatePrompt } from '@/features/update/UpdatePrompt';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { PipelineEvent, PipelineStage } from '@shared/pipeline-events';
import type { ScanProgressEvent } from '@shared/scan-events';

const STAGE_LABEL: Record<PipelineStage, string> = {
  queued: 'Auto-pipeline queued',
  scanning: 'Scanning project',
  'memory-generating': 'Generating memory.md',
  'memory-writing': 'Writing memory.md',
  auditing: 'Running audit',
  completed: 'Auto-pipeline complete',
  failed: 'Auto-pipeline failed'
};

export function AppShell() {
  const qc = useQueryClient();

  useEffect(() => {
    return api.pipeline.onProgress((evt: PipelineEvent) => {
      const label = STAGE_LABEL[evt.stage];
      if (evt.stage === 'completed') {
        toast.success(label, evt.message);
        qc.invalidateQueries({ queryKey: ['projects'] });
        qc.invalidateQueries({ queryKey: ['scans', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['audits', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['memory', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['git-status', evt.projectId] });
      } else if (evt.stage === 'failed') {
        toast.error(label, evt.errorMessage ?? evt.message);
      } else {
        toast.info(label, evt.message);
      }
    });
  }, [qc]);

  useEffect(() => {
    return api.scans.onProgress((evt: ScanProgressEvent) => {
      if (evt.stage === 'completed') {
        qc.invalidateQueries({ queryKey: ['scans', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['projects', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['projects'] });
      }
    });
  }, [qc]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black">
      <div
        className="flex h-8 shrink-0 items-center justify-between bg-black px-3 text-white"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="text-xs font-semibold tracking-wide">VibeOps</div>
        <div style={{ width: 138 }} />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <UpdatePrompt />
    </div>
  );
}
