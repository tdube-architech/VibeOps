import { useQuery } from '@tanstack/react-query';
import { ExternalLink, GitBranch as GitBranchIcon, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { Project, GitCommit } from '@shared/types';

const gitInfoKey = (id: string) => ['git-info', id] as const;

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function browseUrl(remoteUrl: string | null): string | null {
  if (!remoteUrl) return null;
  let url = remoteUrl.trim();
  url = url.replace(/\.git$/, '');
  if (url.startsWith('git@')) {
    url = url.replace(/^git@([^:]+):/, 'https://$1/');
  } else if (url.startsWith('ssh://git@')) {
    url = url.replace(/^ssh:\/\/git@/, 'https://');
  }
  if (!/^https?:\/\//.test(url)) return null;
  return url;
}

function commitUrl(repoBrowse: string | null, sha: string): string | null {
  if (!repoBrowse) return null;
  if (/github\.com|gitlab\.com|bitbucket\.org/.test(repoBrowse)) {
    return `${repoBrowse}/commit/${sha}`;
  }
  return null;
}

function CommitRow({ c, browse }: { c: GitCommit; browse: string | null }) {
  const url = commitUrl(browse, c.sha);
  return (
    <tr className="border-b border-border/40 last:border-b-0">
      <td className="py-2 pr-3 align-top font-mono text-xs">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {c.shortSha}
          </a>
        ) : c.shortSha}
      </td>
      <td className="py-2 pr-3 align-top text-sm">{c.subject}</td>
      <td className="py-2 pr-3 align-top text-xs text-muted-foreground whitespace-nowrap">{c.author}</td>
      <td className="py-2 align-top text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.date)}</td>
    </tr>
  );
}

export function ProjectGitTab({ project }: { project: Project }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: gitInfoKey(project.id),
    queryFn: () => api.projectsExtra.gitInfo(project.id),
    staleTime: 30_000
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading git info…</div>;
  if (!data) return <div className="text-sm text-muted-foreground">No data.</div>;

  const { status, recentCommits, branches, remotes } = data;
  const browse = browseUrl(status.remoteUrl);

  if (!status.isRepo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not a Git repository</CardTitle>
          <CardDescription>
            This project folder has no <code>.git</code> directory. Initialize one with{' '}
            <code>git init</code> to track changes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!status.hasGitBinary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Git CLI not available</CardTitle>
          <CardDescription>
            VibeOps detected a <code>.git</code> directory but couldn&apos;t run the <code>git</code> binary.
            Install Git from <a className="underline" href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">git-scm.com</a>
            and restart VibeOps to see commit history and branches.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <div>Branch (from .git/HEAD): <span className="font-mono">{status.branch ?? '—'}</span></div>
          <div>Remote (from .git/config): <span className="font-mono break-all">{status.remoteUrl ?? '—'}</span></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranchIcon className="h-4 w-4" />
                {status.branch ?? '(unknown)'}
                {status.dirty
                  ? <Badge variant="destructive">Dirty</Badge>
                  : <Badge variant="secondary">Clean</Badge>}
              </CardTitle>
              <CardDescription>
                {status.upstream
                  ? <>tracking <span className="font-mono">{status.upstream}</span> · ahead {status.aheadBy ?? 0} · behind {status.behindBy ?? 0}</>
                  : <>no upstream tracking branch</>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {remotes.length > 0 && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Remotes</div>
              <div className="space-y-1">
                {remotes.map((r) => {
                  const u = browseUrl(r.url);
                  return (
                    <div key={r.name} className="flex items-center gap-2">
                      <span className="font-mono text-xs">{r.name}</span>
                      <code className="text-xs break-all flex-1">{r.url}</code>
                      {u && (
                        <a href={u} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
                          open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {status.lastCommit && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">HEAD</div>
              <div className="text-sm">
                <span className="font-mono text-xs">{status.lastCommit.shortSha}</span>{' '}
                {status.lastCommit.subject}
                <div className="t-meta">
                  {status.lastCommit.author} · {formatDate(status.lastCommit.date)}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent commits</CardTitle>
          <CardDescription>{recentCommits.length} most recent commits on this branch.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCommits.length === 0 ? (
            <div className="text-sm text-muted-foreground">No commits.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="py-1 pr-3">SHA</th>
                    <th className="py-1 pr-3">Subject</th>
                    <th className="py-1 pr-3">Author</th>
                    <th className="py-1">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCommits.map((c) => <CommitRow key={c.sha} c={c} browse={browse} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Local branches ({branches.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <div className="text-sm text-muted-foreground">No local branches.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {branches.map((b) => (
                <div key={b.name} className="grid grid-cols-12 gap-2 border-b border-border/40 py-1 last:border-b-0">
                  <div className="col-span-3 flex items-center gap-2">
                    <span className={`font-mono text-xs ${b.isCurrent ? 'font-semibold text-primary' : ''}`}>
                      {b.isCurrent ? '* ' : '  '}{b.name}
                    </span>
                  </div>
                  <div className="col-span-2 t-meta">{b.upstream ?? '—'}</div>
                  <div className="col-span-5 text-xs truncate">{b.lastCommit?.subject ?? '—'}</div>
                  <div className="col-span-2 text-xs text-muted-foreground text-right whitespace-nowrap">
                    {b.lastCommit ? formatDate(b.lastCommit.date) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
