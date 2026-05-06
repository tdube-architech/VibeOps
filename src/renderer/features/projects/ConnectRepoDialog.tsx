import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Lock, Globe, Plus, Link as LinkIcon } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/lib/toast';
import { getSupabase } from '@/lib/supabase';
import {
  createGitHubRepo, getMyGitHubCredentials, listMyGitHubNamespaces,
  grantRepoAccess, type CreateRepoArgs
} from '@/lib/data/githubIntegration';
import { listMembers } from '@/lib/data/members';
import type { Project } from '@shared/types';

interface Props {
  project: Project;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Mode = 'create' | 'link';

export function ConnectRepoDialog({ project, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState(project.slug);
  const [description, setDescription] = useState(project.description ?? '');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [namespace, setNamespace] = useState('user');
  const [linkUrl, setLinkUrl] = useState('');
  const [progress, setProgress] = useState<string[]>([]);

  const creds = useQuery({ queryKey: ['github', 'me'], queryFn: getMyGitHubCredentials, enabled: open });
  const namespaces = useQuery({
    queryKey: ['github', 'namespaces'],
    queryFn: listMyGitHubNamespaces,
    enabled: open && Boolean(creds.data?.hasPat)
  });
  const members = useQuery({
    queryKey: ['workspace-members', project.workspaceId],
    queryFn: () => listMembers(project.workspaceId),
    enabled: open && Boolean(project.workspaceId)
  });

  useEffect(() => {
    if (!open) {
      setProgress([]);
      setMode('create');
      setName(project.slug);
      setDescription(project.description ?? '');
      setVisibility('private');
      setNamespace('user');
      setLinkUrl('');
    }
  }, [open, project.slug, project.description]);

  function log(line: string): void { setProgress((p) => [...p, line]); }

  const action = useMutation({
    mutationFn: async () => {
      let repoUrl: string;
      if (mode === 'create') {
        if (!creds.data?.hasPat) {
          throw new Error('Connect GitHub in Settings → Integrations first.');
        }
        if (!name.trim()) throw new Error('Repo name required.');
        log(`Creating GitHub repo "${name.trim()}"...`);
        const repoArgs: CreateRepoArgs = {
          name: name.trim(),
          private: visibility === 'private'
        };
        const desc = description.trim();
        if (desc) repoArgs.description = desc;
        if (namespace !== 'user') repoArgs.org = namespace;
        const repo = await createGitHubRepo(repoArgs);
        repoUrl = repo.repoUrl;
        log(`✓ Repo at ${repo.htmlUrl}`);
      } else {
        const pasted = linkUrl.trim();
        if (!/^(https?:\/\/|git@).+/i.test(pasted)) {
          throw new Error('Paste a valid GitHub URL (https://github.com/owner/repo or git@github.com:owner/repo).');
        }
        repoUrl = pasted;
        log(`Linking existing repo ${repoUrl}`);
      }

      const supabase = getSupabase();
      const { error: updateErr } = await supabase
        .from('projects')
        .update({ repo_url: repoUrl })
        .eq('id', project.id);
      if (updateErr) throw new Error(updateErr.message);
      log('✓ Project record updated');

      // Grant repo access to every workspace member who has a GitHub
      // username configured. Members without one are skipped silently.
      const ms = await listMembers(project.workspaceId);
      let granted = 0;
      let skipped = 0;
      for (const m of ms) {
        const r = await grantRepoAccess({ projectId: project.id, memberUserId: m.userId });
        if (r.status === 'self-owner') {
          log(`· ${m.email} owns the repo (skipped)`);
          continue;
        }
        if (r.ok) {
          granted += 1;
          log(`✓ Granted ${m.email}`);
        } else {
          skipped += 1;
          log(`! Skipped ${m.email}: ${r.error ?? 'unknown'}`);
        }
      }
      log(`Done. Granted ${granted}, skipped ${skipped}.`);
      return { repoUrl, granted, skipped };
    },
    onSuccess: ({ granted, skipped }) => {
      toast.success(
        'Repo connected',
        `${granted} teammate${granted === 1 ? '' : 's'} granted access${skipped ? `, ${skipped} skipped` : ''}.`
      );
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', project.id] });
      qc.invalidateQueries({ queryKey: ['project-grants', project.id] });
      onOpenChange(false);
    },
    onError: (e) => toast.error('Could not connect repo', (e as Error).message)
  });

  const canRun = !action.isPending && (
    mode === 'create'
      ? Boolean(creds.data?.hasPat) && name.trim().length > 0
      : linkUrl.trim().length > 0
  );

  const memberCount = members.data?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!action.isPending) onOpenChange(v); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect GitHub repo</DialogTitle>
          <DialogDescription>
            Set up a GitHub repo for <strong>{project.name}</strong> so teammates can clone, pull, and push.
            Workspace members get added as collaborators.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant={mode === 'create' ? 'default' : 'outline'} onClick={() => setMode('create')}>
            <Plus className="h-3.5 w-3.5" /> Create new repo
          </Button>
          <Button size="sm" variant={mode === 'link' ? 'default' : 'outline'} onClick={() => setMode('link')}>
            <LinkIcon className="h-3.5 w-3.5" /> Link existing URL
          </Button>
        </div>

        {mode === 'create' && (
          <div className="space-y-3 text-sm">
            {!creds.data?.hasPat && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                Need a connected GitHub session first. Go to Settings → Integrations → Reconnect GitHub.
              </div>
            )}
            <div>
              <Label className="text-xs">Repo name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-app" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Visibility</Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={visibility === 'private' ? 'default' : 'outline'}
                    onClick={() => setVisibility('private')}
                  >
                    <Lock className="h-3.5 w-3.5" /> Private
                  </Button>
                  <Button
                    size="sm"
                    variant={visibility === 'public' ? 'default' : 'outline'}
                    onClick={() => setVisibility('public')}
                  >
                    <Globe className="h-3.5 w-3.5" /> Public
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-xs">Namespace</Label>
                <select
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                >
                  <option value="user">@{namespaces.data?.username ?? creds.data?.githubUsername ?? '...'} (your account)</option>
                  {namespaces.data?.orgs.map((o) => (
                    <option key={o.login} value={o.login}>{o.login} (org)</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {mode === 'link' && (
          <div className="space-y-2 text-sm">
            <Label className="text-xs">GitHub URL</Label>
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://github.com/octocat/my-app"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Paste an existing repo URL. We'll record it on the project and grant your workspace members
              collaborator access on it.
            </p>
          </div>
        )}

        <div className="rounded-md border border-border bg-muted/30 p-2 text-xs">
          <GitBranch className="mr-1 inline h-3 w-3" />
          {memberCount} workspace member{memberCount === 1 ? '' : 's'} will be invited as collaborators.
          Members without a linked GitHub username get skipped (they need to sign in to VibeOps + Reconnect GitHub).
        </div>

        {progress.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-tight text-muted-foreground">
            {progress.join('\n')}
          </pre>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={action.isPending}>
            Cancel
          </Button>
          <Button onClick={() => action.mutate()} disabled={!canRun}>
            {action.isPending ? 'Working…' : (mode === 'create' ? 'Create repo' : 'Link repo')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
