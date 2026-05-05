import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProjectStatusBadge } from '@/features/projects/ProjectStatusBadge';
import { ProjectSummaryCard } from '@/features/projects/ProjectSummaryCard';
import { useLatestScan } from '@/features/projects/useScans';
import { api } from '@/lib/api';
import type { Project } from '@shared/types';

function row(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-border py-2 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">{value}</div>
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  const { data: latest } = useLatestScan(project.id);
  const { data: gitInfo } = useQuery({
    queryKey: ['git-info', project.id],
    queryFn: () => api.projectsExtra.gitInfo(project.id),
    staleTime: 60_000
  });
  const git = gitInfo?.status ?? null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{project.name}</CardTitle>
          <CardDescription>{project.description ?? 'No description yet.'}</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {row('Status', <ProjectStatusBadge status={project.status} />)}
          {row('Local Path', <code className="text-xs break-all">{project.localPath}</code>)}
          {row('Repository', project.repoUrl ?? git?.remoteUrl ?? '—')}
          {row('Category', project.category ?? '—')}
          {row('Tags', project.tags.length === 0 ? '—' : project.tags.join(', '))}
          {row('Last Scan', project.lastScannedAt ?? 'Never')}
          {row('Last Audit', project.lastAuditedAt ?? 'Never')}
          {row('Created', new Date(project.createdAt).toLocaleString())}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Git Status</CardTitle>
          <CardDescription>
            {git === null ? 'Checking…' : git.isRepo ? 'Tracked by Git' : 'Not a Git repository'}
          </CardDescription>
        </CardHeader>
        {git?.isRepo && (
          <CardContent className="space-y-1 text-sm">
            {row('Branch', git.branch ?? '—')}
            {row('Remote', git.remoteUrl ?? '—')}
            {row('Upstream', git.upstream ?? '—')}
            {row('Ahead / Behind', git.upstream
              ? `${git.aheadBy ?? 0} ahead, ${git.behindBy ?? 0} behind`
              : '—')}
            {row('Working Tree', git.dirty === null
              ? '—'
              : git.dirty
                ? <Badge variant="destructive">Dirty</Badge>
                : <Badge variant="secondary">Clean</Badge>)}
            {row('Last Commit', git.lastCommit
              ? <><span className="font-mono text-xs">{git.lastCommit.shortSha}</span> {git.lastCommit.subject}</>
              : '—')}
          </CardContent>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detected Stack</CardTitle>
          <CardDescription>{latest?.summary ?? 'Run a scan to populate.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <div className="text-sm text-muted-foreground">No scan yet. Open the Scan tab to run one.</div>
          ) : (() => {
            const d = latest.detection;
            const nothingDetected = !d.primaryStack && !d.packageManager && !d.database
              && !d.auth && !d.deployment && d.frameworks.length === 0;
            return (
              <div className="space-y-1 text-sm">
                {nothingDetected && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600">
                    No recognized frameworks, package manager, database, auth, or deployment target were found in {latest.fileCount} indexed files.
                    The scanner only inspects the project root and config files — confirm you pointed at the project root, not a parent folder.
                  </div>
                )}
                {row('Primary Stack', d.primaryStack ?? '—')}
                {row('Frameworks', d.frameworks.join(', ') || '—')}
                {row('Package Manager', d.packageManager ?? '—')}
                {row('Database', d.database ?? '—')}
                {row('Auth', d.auth ?? '—')}
                {row('Deployment', d.deployment ?? '—')}
                {row('Files indexed', String(latest.fileCount))}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      <ProjectSummaryCard projectId={project.id} />
    </div>
  );
}
