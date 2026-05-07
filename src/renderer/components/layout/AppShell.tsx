import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { UpdateBanner } from '@/features/update/UpdateBanner';
import { reconcileLiveSessions } from '@/features/terminal/terminalStore';
import { MigrationGate } from '@/features/migrate/MigrationGate';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useActiveWorkspaceId, useEnsureDefaultWorkspace } from '@/features/workspaces/useWorkspaces';
import { useWorkspaceTasksRealtime } from '@/lib/data/realtime';
import { useTaskCommentSummaryRealtime } from '@/features/tasks/useTasks';
import { pushAuditCompleted, pushScanCompleted } from '@/lib/data/sync-progress';
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

const SIDEBAR_COLLAPSED_KEY = 'sidebar:collapsed';

function readInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppShell() {
  const qc = useQueryClient();
  useEnsureDefaultWorkspace();
  useWorkspaceTasksRealtime(useActiveWorkspaceId());
  useTaskCommentSummaryRealtime();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readInitialCollapsed);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch { /* ignore quota / disabled storage */ }
      return next;
    });
  }, []);

  // On app boot, reconcile persisted terminal cells against the main
  // process's live sessions list — clears stale localTerminalId entries so
  // the user can re-Start cells whose PTY died (e.g. after a crash).
  useEffect(() => { void reconcileLiveSessions(); }, []);

  useEffect(() => {
    return api.pipeline.onProgress((evt: PipelineEvent) => {
      const label = STAGE_LABEL[evt.stage];
      if (evt.stage === 'completed') {
        toast.success(label, evt.message);
        const now = new Date().toISOString();
        void (async () => {
          try {
            const latest = await api.scans.latest(evt.projectId);
            await pushScanCompleted(
              evt.projectId,
              latest?.completedAt ?? now,
              undefined,
              latest?.detection?.primaryStack ?? null
            );
          } catch { /* soft-fail */ }
          await pushAuditCompleted(evt.projectId, now).catch(() => undefined);
          qc.invalidateQueries({ queryKey: ['projects'] });
        })();
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
        void pushScanCompleted(evt.projectId, new Date().toISOString()).catch(() => undefined);
        qc.invalidateQueries({ queryKey: ['scans', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['projects', evt.projectId] });
        qc.invalidateQueries({ queryKey: ['projects'] });
      }
    });
  }, [qc]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black">
      <div
        className="flex h-8 shrink-0 items-center justify-between bg-black pl-3 pr-0 text-white"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="text-xs font-semibold tracking-wide">VibeOps</div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <div style={{ width: 138 }} />
        </div>
      </div>
      <UpdateBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <MigrationGate />
    </div>
  );
}
