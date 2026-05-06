import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, FolderOpen, Lock, Globe, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/useAuth';
import { useActiveWorkspaceId, useWorkspaceList } from '@/features/workspaces/useWorkspaces';
import { listMembers, type MemberRole } from '@/lib/data/members';
import { setProjectLocalPath } from '@/lib/data/projects';
import {
  createGitHubRepo, listMyGitHubNamespaces, getMyGitHubCredentials, grantRepoAccess,
  checkGitHubRepoExists, type RepoStatus
} from '@/lib/data/githubIntegration';
import { setProjectVisibility } from '@/lib/data/projects';

function useGitHubUsernameFromSession(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      const meta = data.session?.user?.user_metadata as Record<string, unknown> | undefined;
      const u = (meta?.['user_name'] as string | undefined)
            ?? (meta?.['preferred_username'] as string | undefined)
            ?? null;
      setName(u);
    });
  }, []);
  return name;
}

const CODE_ROOT_KEY = 'vibeops:code-root';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (projectId: string) => void;
}

interface CollaboratorChoice {
  userId: string;
  email: string;
  displayName: string | null;
  role: 'editor' | 'viewer';
  selected: boolean;
}

type Visibility = 'public' | 'private';

export function NewProjectWizard({ open, onOpenChange, onCreated }: Props) {
  const activeWsId = useActiveWorkspaceId();
  const workspaces = useWorkspaceList();
  const { state } = useAuth();
  const myUserId = state?.user?.id ?? null;
  const qc = useQueryClient();
  const [wsId, setWsId] = useState<string | null>(null);

  useEffect(() => {
    if (open && !wsId) setWsId(activeWsId);
  }, [open, activeWsId, wsId]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [namespace, setNamespace] = useState('user');
  const [codeRoot, setCodeRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [collabs, setCollabs] = useState<CollaboratorChoice[]>([]);

  const slug = slugify(name);
  const targetDir = codeRoot ? joinPath(codeRoot, slug) : '';
  const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
  const sessionUsername = useGitHubUsernameFromSession();
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [adoptExisting, setAdoptExisting] = useState(false);

  const creds = useQuery({
    queryKey: ['github', 'me'],
    queryFn: getMyGitHubCredentials,
    enabled: open
  });
  const namespaces = useQuery({
    queryKey: ['github', 'namespaces'],
    queryFn: listMyGitHubNamespaces,
    enabled: open && !!creds.data?.hasPat
  });
  const members = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: () => listMembers(wsId!),
    enabled: open && !!wsId
  });

  // My role in the chosen workspace — block creation if I'm a viewer.
  const myRole = useQuery({
    queryKey: ['my-role', wsId, myUserId],
    queryFn: async () => {
      if (!wsId || !myUserId) return null;
      const list = await listMembers(wsId);
      return list.find((m) => m.userId === myUserId)?.role ?? null;
    },
    enabled: open && !!wsId && !!myUserId
  });
  const canWriteHere = myRole.data === 'owner' || myRole.data === 'editor';

  useEffect(() => {
    if (!open) return;
    const stored = window.localStorage.getItem(CODE_ROOT_KEY);
    if (stored) setCodeRoot(stored);
    else void api.projectsExtra.defaultCodeRoot().then((r) => setCodeRoot(r.root));
  }, [open]);

  // Debounced availability check whenever the slug or namespace changes.
  useEffect(() => {
    if (!open || !slug || !creds.data?.hasPat) {
      setRepoStatus(null);
      return;
    }
    setStatusLoading(true);
    setAdoptExisting(false);
    const t = setTimeout(async () => {
      try {
        const r = await checkGitHubRepoExists({
          name: slug,
          ...(namespace !== 'user' ? { org: namespace } : {})
        });
        setRepoStatus(r);
      } catch (e) {
        console.warn('[new-project] check-repo failed', e);
        setRepoStatus(null);
      } finally {
        setStatusLoading(false);
      }
    }, 500);
    return () => { clearTimeout(t); setStatusLoading(false); };
  }, [open, slug, namespace, creds.data?.hasPat]);

  // Pre-populate collaborators from workspace members (excluding self).
  useEffect(() => {
    if (!members.data || !myUserId) return;
    setCollabs((prev) => {
      if (prev.length > 0) return prev;
      return members.data
        .filter((m) => m.userId !== myUserId)
        .map((m) => ({
          userId: m.userId,
          email: m.email,
          displayName: m.displayName,
          role: m.role === 'viewer' ? 'viewer' : 'editor',
          selected: true
        }));
    });
  }, [members.data, myUserId]);

  function reset(): void {
    setName(''); setDescription(''); setCategory(''); setTagsInput('');
    setVisibility('private'); setNamespace('user');
    setCollabs([]); setProgress([]); setBusy(false);
    setWsId(null);
  }

  async function chooseCodeRoot(): Promise<void> {
    const r = await api.projects.pickFolder();
    if (!r.canceled && r.path) {
      setCodeRoot(r.path);
      window.localStorage.setItem(CODE_ROOT_KEY, r.path);
    }
  }

  function log(line: string): void {
    setProgress((p) => [...p, line]);
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!wsId) throw new Error('Pick a workspace first.');
      if (!canWriteHere) {
        throw new Error(
          `You are a ${myRole.data ?? 'non-member'} of this workspace — only owners/editors can create projects here.`
        );
      }
      if (!name.trim()) throw new Error('name required');
      if (!targetDir) throw new Error('local directory required');
      if (!creds.data?.hasPat) throw new Error('Connect GitHub in Settings → Integrations first');
      setBusy(true); setProgress([]);

      let repo: { repoUrl: string; htmlUrl: string; defaultBranch: string; owner: string; name: string };
      if (adoptExisting && repoStatus?.exists && repoStatus.cloneUrl) {
        log(`Using existing repo at ${repoStatus.htmlUrl}`);
        repo = {
          repoUrl: repoStatus.cloneUrl,
          htmlUrl: repoStatus.htmlUrl ?? repoStatus.cloneUrl,
          defaultBranch: repoStatus.defaultBranch ?? 'main',
          owner: repoStatus.owner,
          name: repoStatus.name
        };
      } else {
        log(`Creating GitHub repo "${slug}"...`);
        const repoArgs: import('@/lib/data/githubIntegration').CreateRepoArgs = {
          name: slug,
          private: visibility === 'private'
        };
        const desc = description.trim();
        if (desc) repoArgs.description = desc;
        if (namespace !== 'user') repoArgs.org = namespace;
        repo = await createGitHubRepo(repoArgs);
        log(`✓ Repo at ${repo.htmlUrl}`);
      }

      // Wait for GitHub to finish initializing the repo before cloning.
      // If the target dir already contains a clone of this repo, reuse it
      // instead of cloning. Catches the common "I cloned it earlier" case
      // when adopting an existing repo.
      const existingRemote = await api.projectsExtra.gitRemoteUrl(targetDir).catch(() => ({ url: null }));
      let finalCwd: string;
      if (existingRemote.url && remotesMatch(existingRemote.url, repo.repoUrl)) {
        log(`Found existing clone at ${targetDir} — reusing.`);
        finalCwd = targetDir;
      } else {
        log('Cloning to local directory...');
        interface CloneOutcome { ok: boolean; cwd: string | null; error: string | null }
        const cloneResult = await new Promise<CloneOutcome>((resolve) => {
          let jobId: string | null = null;
          const off = api.projectsExtra.onCloneProgress((evt) => {
            if (evt.jobId !== jobId) return;
            if (evt.line) log(evt.line.replace(/\n$/, ''));
            if (evt.done) {
              off();
              resolve({ ok: !!evt.ok, cwd: evt.cwd ?? null, error: evt.error ?? null });
            }
          });
          void api.projectsExtra.cloneStart(repo.repoUrl, targetDir).then((r) => {
            jobId = r.jobId;
          });
        });
        if (!cloneResult.ok || !cloneResult.cwd) {
          throw new Error(cloneResult.error ?? 'clone failed');
        }
        finalCwd = cloneResult.cwd;
        log(`✓ Cloned to ${finalCwd}`);
      }

      const supabase = getSupabase();
      const initialVisibility = collabs.some((c) => c.selected) ? 'restricted' : 'workspace';
      const { data: row, error } = await supabase.rpc('create_project_for_wizard', {
        ws_id: wsId,
        proj_name: name.trim(),
        proj_slug: slug,
        proj_desc: description.trim() || null,
        proj_repo: repo.repoUrl,
        proj_cat: category.trim() || null,
        proj_tags: tags,
        proj_vis: initialVisibility
      });
      if (error) throw new Error(error.message);
      const projectId = (row as { id: string }).id;
      log('✓ Project record created');

      await setProjectLocalPath(projectId, finalCwd);
      log('✓ Local path saved');

      // Add collaborators to project ACL + grant GitHub access.
      const selected = collabs.filter((c) => c.selected);
      for (const c of selected) {
        const { error: insErr } = await supabase.from('project_members').insert({
          project_id: projectId,
          user_id: c.userId,
          role: c.role
        });
        if (insErr) log(`! ACL add failed for ${c.email}: ${insErr.message}`);

        const grant = await grantRepoAccess({ projectId, memberUserId: c.userId });
        if (grant.ok) log(`✓ GitHub access granted to ${c.email}`);
        else log(`! GitHub grant failed for ${c.email}: ${grant.error ?? 'unknown'}`);
      }
      // If any collaborators selected, keep visibility=restricted; otherwise
      // workspace (default for everyone in workspace to see).
      if (initialVisibility === 'restricted') {
        await setProjectVisibility(projectId, 'restricted');
      }

      log('Done.');
      return projectId;
    },
    onSuccess: (projectId) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
      onCreated?.(projectId);
      onOpenChange(false);
      reset();
    },
    onError: (e) => {
      console.error('[new-project] failed', e);
      toast.error('Could not create project', (e as Error).message);
      setBusy(false);
    }
  });

  const repoBlocked = repoStatus?.exists && !adoptExisting;
  const canCreate =
    !busy && !!name.trim() && !!targetDir && !!creds.data?.hasPat && canWriteHere && !repoBlocked;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Create a fresh GitHub repository, clone it locally, and set up cloud collaboration.
          </DialogDescription>
        </DialogHeader>

        {!creds.data?.hasPat && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            VibeOps needs the GitHub permissions you signed in with. Go to{' '}
            <strong>Settings → Integrations</strong> and click <em>Reconnect GitHub</em> so we
            can create the repo on your behalf.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="col-span-2">
            <Label className="text-xs">Workspace</Label>
            <select
              value={wsId ?? ''}
              onChange={(e) => setWsId(e.target.value || null)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="" disabled>Pick a workspace…</option>
              {(workspaces.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {wsId && myRole.data && !canWriteHere && (
              <p className="mt-1 text-[11px] text-amber-500">
                You are a <strong>{myRole.data}</strong> in this workspace — only owners and
                editors can create projects. Pick a different workspace.
              </p>
            )}
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Helpdesk" />
            {name && (
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>
                  Slug: <code>{slug}</code>
                </span>
                {statusLoading && <span>checking GitHub…</span>}
                {!statusLoading && repoStatus && !repoStatus.exists && (
                  <span className="text-emerald-500">✓ Available</span>
                )}
                {!statusLoading && repoStatus?.exists && (
                  <span className="text-amber-500">
                    ⚠ Already exists at {repoStatus.owner}/{repoStatus.name}
                  </span>
                )}
              </div>
            )}
            {repoStatus?.exists && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                <input
                  type="checkbox"
                  id="adopt-existing"
                  checked={adoptExisting}
                  onChange={(e) => setAdoptExisting(e.target.checked)}
                />
                <label htmlFor="adopt-existing" className="cursor-pointer">
                  Use the existing repo (skip create, just clone &amp; register).
                </label>
              </div>
            )}
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Web app" />
          </div>
          <div>
            <Label className="text-xs">Tags (comma-separated)</Label>
            <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="internal, ops" />
          </div>

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
            <Label className="text-xs">GitHub namespace</Label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="user">
                @{namespaces.data?.username ?? creds.data?.githubUsername ?? sessionUsername ?? '...'} (your account)
              </option>
              {namespaces.data?.orgs.map((o) => (
                <option key={o.login} value={o.login}>{o.login} (org)</option>
              ))}
            </select>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Local directory</Label>
            <div className="flex gap-2">
              <Input value={targetDir} readOnly className="font-mono text-xs" />
              <Button size="sm" variant="outline" onClick={chooseCodeRoot}>
                <FolderOpen className="h-3.5 w-3.5" /> Code root
              </Button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              The repo is cloned here after creation.
            </p>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Invite collaborators</Label>
            <div className="rounded-md border border-border p-2">
              {collabs.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  No other workspace members yet. Invite them via Settings → Workspace.
                </div>
              ) : (
                <div className="space-y-1">
                  {collabs.map((c) => (
                    <div key={c.userId} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) =>
                          setCollabs((prev) =>
                            prev.map((p) => p.userId === c.userId ? { ...p, selected: e.target.checked } : p)
                          )
                        }
                      />
                      <span className="flex-1 truncate">
                        {c.displayName ?? c.email.split('@')[0]}
                        <span className="ml-2 text-muted-foreground">{c.email}</span>
                      </span>
                      <select
                        value={c.role}
                        onChange={(e) =>
                          setCollabs((prev) =>
                            prev.map((p) => p.userId === c.userId
                              ? { ...p, role: e.target.value as 'editor' | 'viewer' }
                              : p)
                          )
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Selected members get added as repo collaborators on GitHub and gain access in
                VibeOps. If anyone is selected, project visibility becomes restricted (only
                listed members can see); leave all unchecked to share with the whole workspace.
              </p>
            </div>
          </div>
        </div>

        {progress.length > 0 && (
          <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-tight text-muted-foreground">
            {progress.join('\n')}
          </pre>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!canCreate}>
            {busy ? 'Working…' : <><Plus className="h-4 w-4" /> Create project</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function joinPath(root: string, name: string): string {
  if (!root) return name;
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.replace(/[\\/]$/, '') + sep + name;
}

function normalizeRepoUrl(url: string): string {
  let u = url.trim().toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
  const ssh = u.match(/^git@([^:]+):(.+)$/);
  if (ssh) return `${ssh[1]}/${ssh[2]}`;
  const https = u.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/);
  if (https) return `${https[1]}/${https[2]}`;
  return u;
}

function remotesMatch(a: string, b: string): boolean {
  return normalizeRepoUrl(a) === normalizeRepoUrl(b);
}
