import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, GitCommitHorizontal, FileEdit } from 'lucide-react';
import { useProjectDirtyFiles, useProjectCommits } from '@/lib/data/projectActivity';

interface Props {
  projectId: string;
}

export function ActivityPanel({ projectId }: Props) {
  const dirty = useProjectDirtyFiles(projectId);
  const commits = useProjectCommits(projectId, 10);

  if (dirty.length === 0 && commits.length === 0) return null;

  // Group dirty files by user.
  const byUser = new Map<string, typeof dirty>();
  for (const d of dirty) {
    const arr = byUser.get(d.userId) ?? [];
    arr.push(d);
    byUser.set(d.userId, arr);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Live activity
        </CardTitle>
        <CardDescription>
          Modified files and recent commits across everyone working on this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {byUser.size > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Modified files</div>
            {[...byUser.entries()].map(([userId, files]) => (
              <div key={userId} className="rounded-md border border-border p-2">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <FileEdit className="h-3.5 w-3.5 text-amber-500" />
                  <span className="font-mono text-muted-foreground">{userId.slice(0, 8)}…</span>
                  <Badge variant="secondary">{files.length} file{files.length === 1 ? '' : 's'}</Badge>
                </div>
                <div className="grid gap-0.5 font-mono text-[11px] text-muted-foreground">
                  {files.slice(0, 8).map((f) => (
                    <div key={`${f.machineId}:${f.filePath}`} className="truncate">
                      {f.filePath} <span className="text-[10px]">· {timeAgo(f.modifiedAt)}</span>
                    </div>
                  ))}
                  {files.length > 8 && (
                    <div className="text-[10px]">+ {files.length - 8} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {commits.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Recent commits</div>
            <div className="space-y-1">
              {commits.map((c) => (
                <div key={c.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <GitCommitHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="truncate">{c.message}</div>
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-mono">{c.shortSha ?? c.sha.slice(0, 7)}</span>
                      {c.branch && <> · {c.branch}</>}
                      {' · '}
                      <span className="font-mono">{c.userId.slice(0, 8)}…</span>
                      {' · '}
                      {timeAgo(c.ts)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
