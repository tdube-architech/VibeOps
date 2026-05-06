import { useEffect, useState } from 'react';
import { Power, X, Download, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpdateState, useInstallUpdate, useOpenInstallerManually } from './useUpdate';
import { toast } from '@/lib/toast';

const DISMISS_KEY = 'vibeops:update-banner-dismissed';

/**
 * Always-mounted banner shown across the top of the app shell whenever an
 * update has finished downloading. Click installs silently and relaunches.
 */
export function UpdateBanner() {
  const state = useUpdateState();
  const install = useInstallUpdate();
  const openInstaller = useOpenInstallerManually();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    setDismissedFor(window.localStorage.getItem(DISMISS_KEY));
  }, []);

  const status = state?.status ?? 'idle';
  const latest = state?.latestVersion ?? null;
  const showProgress = status === 'downloading' && state?.progressPercent != null;
  const showInstall = status === 'downloaded' && latest !== dismissedFor;

  if (!showInstall && !showProgress) return null;

  function dismiss(): void {
    if (latest) {
      window.localStorage.setItem(DISMISS_KEY, latest);
      setDismissedFor(latest);
    }
  }

  if (showProgress) {
    return (
      <div className="flex items-center gap-3 border-b border-blue-500/40 bg-blue-500/10 px-4 py-1.5 text-xs">
        <Download className="h-3.5 w-3.5 text-blue-300" />
        <span className="font-medium">Downloading update {latest ?? ''}…</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-500/20">
          <div
            className="h-full bg-blue-400 transition-all"
            style={{ width: `${state?.progressPercent ?? 0}%` }}
          />
        </div>
        <span className="tabular-nums">{state?.progressPercent ?? 0}%</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm">
      <Power className="h-4 w-4 text-emerald-300" />
      <span className="flex-1">
        <strong>VibeOps {latest}</strong> is ready to install.
        Click to close, install silently, and relaunch.
      </span>
      <Button size="sm" onClick={() => install.mutate()} disabled={install.isPending}>
        Install &amp; Restart
      </Button>
      {state?.installerPath && (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            const r = await openInstaller.mutateAsync();
            if (!r.ok) toast.error('Could not open installer', r.path ?? 'no path');
          }}
          title="If silent install doesn't relaunch, open the installer here."
        >
          <FolderOpen className="h-3.5 w-3.5" /> Open installer
        </Button>
      )}
      <button onClick={dismiss} className="text-xs text-muted-foreground hover:text-foreground" title="Hide until next launch">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
