import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScanProgressBar } from '@/features/projects/ScanProgressBar';
import {
  useScanList, useLatestScan, useScanFiles, useScanEnvVars, useStartScan, useScanProgress
} from '@/features/projects/useScans';
import type { Project, ScanFile, FileType } from '@shared/types';

const TYPE_BADGE: Record<FileType, 'default' | 'secondary' | 'warning' | 'destructive' | 'outline' | 'success'> = {
  source: 'default',
  config: 'secondary',
  doc: 'outline',
  lock: 'outline',
  'env-example': 'warning',
  'env-secret': 'destructive',
  binary: 'outline',
  asset: 'outline',
  test: 'success',
  unknown: 'outline'
};

export function ProjectScanTab({ project }: { project: Project }) {
  const start = useStartScan();
  const progress = useScanProgress(project.id);
  const { data: history = [] } = useScanList(project.id);
  const { data: latest } = useLatestScan(project.id);
  const [filter, setFilter] = useState('');

  const targetScanId = latest?.id;
  const { data: files = [] } = useScanFiles(targetScanId, project.id);
  const { data: envVars = [] } = useScanEnvVars(targetScanId, project.id);

  const filtered = useMemo<ScanFile[]>(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return files.slice(0, 200);
    return files.filter((file) => file.path.toLowerCase().includes(f)).slice(0, 200);
  }, [files, filter]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Project Scan</CardTitle>
            <CardDescription>Read-only walk of the project tree. No files are modified.</CardDescription>
          </div>
          <Button onClick={() => start.mutate({ id: project.id, localPath: project.localPath, name: project.name, workspaceId: project.workspaceId })} disabled={start.isPending}>
            <Play className="h-4 w-4" /> {start.isPending ? 'Scanning…' : 'Run Scan'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <ScanProgressBar event={progress} />
          {start.isError && (
            <div className="text-sm text-destructive">{(start.error as Error).message}</div>
          )}
          {history.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">History</div>
              <div className="space-y-1 text-sm">
                {history.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div>
                      <div className="font-medium">{s.completedAt ? new Date(s.completedAt).toLocaleString() : 'in progress'}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.fileCount} files · {s.detection.primaryStack ?? '—'}
                      </div>
                    </div>
                    <Badge variant={s.status === 'completed' ? 'success' : s.status === 'failed' ? 'destructive' : 'secondary'}>
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {latest && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Variables (names only)</CardTitle>
              <CardDescription>Extracted from .env.example. Values are never read or stored.</CardDescription>
            </CardHeader>
            <CardContent>
              {envVars.length === 0 ? (
                <div className="text-sm text-muted-foreground">No .env.example found.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1">Variable</th><th>File</th><th>Required</th><th>Comment</th></tr>
                  </thead>
                  <tbody>
                    {envVars.map((v) => (
                      <tr key={v.id} className="border-t border-border">
                        <td className="py-1 font-mono text-xs">{v.variable}</td>
                        <td className="text-xs text-muted-foreground">{v.filename}</td>
                        <td>{v.required ? <Badge variant="warning">required</Badge> : <Badge variant="outline">optional</Badge>}</td>
                        <td className="text-xs text-muted-foreground">{v.comment ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">File Inventory</CardTitle>
              <CardDescription>Top files by importance. Showing up to 200.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Filter by path"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="mb-3 max-w-sm"
              />
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-1">Path</th><th>Type</th><th>Size</th><th>Importance</th></tr>
                </thead>
                <tbody>
                  {filtered.map((f) => (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-1 font-mono text-xs break-all">{f.path}</td>
                      <td><Badge variant={TYPE_BADGE[f.fileType]}>{f.fileType}</Badge></td>
                      <td className="text-xs text-muted-foreground">{(f.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="text-xs text-muted-foreground">{f.importanceScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="py-4 text-center text-sm text-muted-foreground">No matches.</div>}
            </CardContent>
          </Card>

          {latest.warnings.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Warnings</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {latest.warnings.map((w, i) => (
                  <div key={i} className="rounded-md border border-amber-600/40 bg-amber-600/5 px-3 py-2">
                    <div className="text-xs text-amber-600">{w.code}</div>
                    <div>{w.message}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
