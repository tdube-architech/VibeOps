import { Power, RefreshCw, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUpdateState, useCheckUpdate, useInstallUpdate, useOpenInstallerManually } from './useUpdate';
import { toast } from '@/lib/toast';

export function UpdateCard() {
  const state = useUpdateState();
  const check = useCheckUpdate();
  const install = useInstallUpdate();
  const openInstaller = useOpenInstallerManually();
  const status = state?.status ?? 'idle';
  const canInstall = status === 'downloaded';
  const hasInstaller = Boolean(state?.installerPath);

  return (
    <Card>
      <CardHeader>
        <CardTitle>App Updates</CardTitle>
        <CardDescription>
          Current version <Badge variant="outline">{state?.currentVersion ?? '—'}</Badge>
          {state?.latestVersion && <> · Latest <Badge variant="outline">{state.latestVersion}</Badge></>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>
            <RefreshCw className="h-4 w-4" /> Check for Updates
          </Button>
          <Button onClick={() => install.mutate()} disabled={!canInstall}>
            <Power className="h-4 w-4" /> Install &amp; Restart
          </Button>
          {hasInstaller && (
            <Button
              variant="outline"
              onClick={async () => {
                const r = await openInstaller.mutateAsync();
                if (!r.ok) toast.error('Could not open installer', r.path ?? 'no path');
              }}
              title="Open the downloaded installer manually if silent install didn't relaunch."
            >
              <FolderOpen className="h-4 w-4" /> Open installer manually
            </Button>
          )}
        </div>
        {state?.message && <div className="text-sm text-muted-foreground">{state.message}</div>}
        {state?.progressPercent !== null && state?.progressPercent !== undefined && state.status === 'downloading' && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary" style={{ width: `${state.progressPercent}%` }} />
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          New versions download automatically. When ready, click <strong>Install &amp; Restart</strong>
          and VibeOps closes, installs the update silently, and reopens itself. Auto-checks GitHub
          Releases 15 seconds after launch and every 6 hours. If silent install doesn't relaunch,
          use <strong>Open installer manually</strong> as a fallback.
        </div>
        {state?.installerPath && (
          <div className="text-[11px] text-muted-foreground font-mono break-all">
            Installer: {state.installerPath}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
