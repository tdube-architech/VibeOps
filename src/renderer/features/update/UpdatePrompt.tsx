import { useEffect, useState } from 'react';
import { Download, Power, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpdateState, useDownloadUpdate, useInstallUpdate } from './useUpdate';

const DISMISSED_KEY = 'vibeops:update-prompt-dismissed';

export function UpdatePrompt() {
  const state = useUpdateState();
  const download = useDownloadUpdate();
  const install = useInstallUpdate();
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY));
  }, []);

  const status = state?.status ?? 'idle';
  const latest = state?.latestVersion ?? null;

  const isVisible =
    (status === 'available' || status === 'downloading' || status === 'downloaded') &&
    latest !== null &&
    dismissed !== latest;

  if (!isVisible) return null;

  function handleDismiss() {
    if (latest) {
      localStorage.setItem(DISMISSED_KEY, latest);
      setDismissed(latest);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[380px] rounded-lg border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <span className="font-semibold">Update Available</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Version <span className="font-mono">{latest}</span> is ready
            (current <span className="font-mono">{state?.currentVersion}</span>).
          </div>
          {status === 'downloading' && state?.progressPercent !== null && state?.progressPercent !== undefined && (
            <div className="space-y-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${state.progressPercent}%` }} />
              </div>
              <div className="text-xs text-muted-foreground">Downloading… {state.progressPercent}%</div>
            </div>
          )}
          {status === 'downloaded' && (
            <div className="text-sm text-muted-foreground">Restart to apply the update.</div>
          )}
          <div className="flex gap-2 pt-1">
            {status === 'available' && (
              <Button size="sm" onClick={() => download.mutate()} disabled={download.isPending}>
                <Download className="h-4 w-4" /> Download
              </Button>
            )}
            {status === 'downloaded' && (
              <Button size="sm" onClick={() => install.mutate()}>
                <Power className="h-4 w-4" /> Restart Now
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Later
            </Button>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
