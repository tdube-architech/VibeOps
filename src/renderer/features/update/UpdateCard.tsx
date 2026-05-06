import { Power, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUpdateState, useCheckUpdate, useInstallUpdate } from './useUpdate';

export function UpdateCard() {
  const state = useUpdateState();
  const check = useCheckUpdate();
  const install = useInstallUpdate();
  const status = state?.status ?? 'idle';
  const canInstall = status === 'downloaded';

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
          Releases 15 seconds after launch and every 6 hours.
        </div>
      </CardContent>
    </Card>
  );
}
