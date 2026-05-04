import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectStatusBadge } from '@/features/projects/ProjectStatusBadge';
import { useLatestScan } from '@/features/projects/useScans';
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
          {row('Repository', project.repoUrl ?? '—')}
          {row('Category', project.category ?? '—')}
          {row('Tags', project.tags.length === 0 ? '—' : project.tags.join(', '))}
          {row('Last Scan', project.lastScannedAt ?? 'Never')}
          {row('Last Audit', project.lastAuditedAt ?? 'Never (Phase 5)')}
          {row('Created', new Date(project.createdAt).toLocaleString())}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detected Stack</CardTitle>
          <CardDescription>{latest?.summary ?? 'Run a scan to populate.'}</CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <div className="text-sm text-muted-foreground">No scan yet. Open the Scan tab to run one.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {row('Primary Stack', latest.detection.primaryStack ?? '—')}
              {row('Frameworks', latest.detection.frameworks.join(', ') || '—')}
              {row('Package Manager', latest.detection.packageManager ?? '—')}
              {row('Database', latest.detection.database ?? '—')}
              {row('Auth', latest.detection.auth ?? '—')}
              {row('Deployment', latest.detection.deployment ?? '—')}
              {row('Files indexed', String(latest.fileCount))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
