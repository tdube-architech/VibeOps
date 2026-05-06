import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import { reconnectGitHub } from '@/features/auth/useAuth';
import {
  getMyGitHubCredentials,
  syncGitHubCredentialsFromSession
} from '@/lib/data/githubIntegration';

export function GitHubIntegrationCard() {
  const qc = useQueryClient();
  const { data: creds, isLoading } = useQuery({
    queryKey: ['github', 'me'],
    queryFn: getMyGitHubCredentials
  });

  const reconnect = useMutation({
    mutationFn: async () => {
      const r = await reconnectGitHub();
      if (r.error) throw new Error(r.error);
      // After the OAuth dance completes (user returns via deep link), the
      // existing post-sign-in effect will sync credentials. We also poke a
      // sync here so the local cache is fresh for users who already had a
      // session.
      await syncGitHubCredentialsFromSession();
    },
    onSuccess: () => {
      toast.info('GitHub authorize window opened',
        'Approve the requested permissions; we\'ll capture your token automatically.');
      qc.invalidateQueries({ queryKey: ['github'] });
    },
    onError: (e) => toast.error('Could not reconnect', (e as Error).message)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> GitHub integration
        </CardTitle>
        <CardDescription>
          VibeOps uses your GitHub login to create repos for new projects and add teammates as
          collaborators. The connection is captured automatically when you sign in — no token
          to paste.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Status</span>
          {isLoading ? (
            <span className="text-muted-foreground">Loading…</span>
          ) : creds?.githubUsername ? (
            <>
              <Badge variant="success">Connected as @{creds.githubUsername}</Badge>
              {creds.hasPat
                ? <Badge variant="success">Token active</Badge>
                : <Badge variant="warning">Token missing — Reconnect</Badge>}
            </>
          ) : (
            <Badge variant="warning">Not connected — Reconnect</Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          {creds?.hasPat
            ? 'You can create new project repos and grant teammates access from the Workspace tab.'
            : 'Reconnect to authorize VibeOps to create repos and manage collaborators on your behalf.'}
        </div>

        <Button
          variant={creds?.hasPat ? 'outline' : 'default'}
          onClick={() => reconnect.mutate()}
          disabled={reconnect.isPending}
        >
          <RefreshCw className="h-4 w-4" />
          {creds?.hasPat ? 'Reconnect GitHub' : 'Connect GitHub'}
        </Button>
      </CardContent>
    </Card>
  );
}
