import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Users, ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { listMembers } from '@/lib/data/members';
import { grantRepoAccess } from '@/lib/data/githubIntegration';
import { ConnectRepoDialog } from './ConnectRepoDialog';
import type { Project } from '@shared/types';

interface Props { project: Project }

export function RepoAccessPanel({ project }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const sync = useMutation({
    mutationFn: async () => {
      if (!project.repoUrl) throw new Error('No repo connected.');
      const ms = await listMembers(project.workspaceId);
      let granted = 0;
      let skipped = 0;
      let selfOwner = 0;
      const results: Array<{ email: string; ok: boolean; error: string | null }> = [];
      for (const m of ms) {
        const r = await grantRepoAccess({ projectId: project.id, memberUserId: m.userId });
        if (r.status === 'self-owner') { selfOwner += 1; continue; }
        results.push({ email: m.email, ok: r.ok, error: r.error ?? null });
        if (r.ok) granted += 1; else skipped += 1;
      }
      return { granted, skipped, total: ms.length - selfOwner, results };
    },
    onSuccess: ({ granted, skipped, total, results }) => {
      const failures = results.filter((r) => !r.ok);
      const firstErr = failures[0]?.error ?? null;
      if (granted === 0 && total > 0) {
        toast.error(
          'No grants succeeded',
          firstErr ?? 'Edge function may not be deployed, or owner lacks GitHub PAT scopes.'
        );
        console.warn('[grant] all failed:', failures);
      } else if (skipped > 0) {
        toast.info(
          `Granted ${granted}/${total}`,
          `${skipped} member(s) skipped${firstErr ? `: ${firstErr}` : ''}`
        );
        console.warn('[grant] partial failures:', failures);
      } else if (total === 0) {
        toast.info('Nothing to sync', 'You are the only member with a repo to grant against.');
      } else {
        toast.success('Repo access synced', `${granted} member(s) added as collaborators.`);
      }
      qc.invalidateQueries({ queryKey: ['project-grants', project.id] });
    },
    onError: (e) => toast.error('Could not sync access', (e as Error).message)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-4 w-4" /> GitHub repo
        </CardTitle>
        <CardDescription>
          {project.repoUrl
            ? 'Repo connected. Workspace members get added as collaborators on demand.'
            : 'No GitHub repo connected. Without one, teammates can\'t pull, commit, or push.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {project.repoUrl ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <code className="flex-1 truncate rounded bg-muted/40 px-2 py-1 font-mono">{project.repoUrl}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void api.auth.openExternal(project.repoUrl!)}
                title="Open on GitHub"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className="h-3.5 w-3.5" />
                {sync.isPending ? 'Syncing…' : 'Sync access for all members'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
                <GitBranch className="h-3.5 w-3.5" /> Change repo
              </Button>
            </div>
            <p className="t-tiny">
              <Users className="mr-1 inline h-3 w-3" />
              Sync invites every workspace member with a linked GitHub username as a collaborator.
              Members are also auto-granted when they accept an invite to this workspace.
            </p>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => setOpen(true)}>
              <GitBranch className="h-3.5 w-3.5" /> Connect to GitHub
            </Button>
            <p className="t-tiny">
              Create a new repo or paste an existing URL. Either way, workspace members get added as
              collaborators with the role they hold here (owner / editor / viewer).
            </p>
          </>
        )}
      </CardContent>
      <ConnectRepoDialog project={project} open={open} onOpenChange={setOpen} />
    </Card>
  );
}
