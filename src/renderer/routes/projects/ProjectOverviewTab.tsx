import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@shared/types';
import { ProjectStatusBadge } from '@/features/projects/ProjectStatusBadge';

function row(label: string, value: React.ReactNode) {
  return (
    <div className="grid grid-cols-3 gap-4 border-b border-border py-2 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm">{value}</div>
    </div>
  );
}

export function ProjectOverviewTab({ project }: { project: Project }) {
  return (
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
        {row('Stack', project.primaryStack ?? '— (run scan in Phase 2)')}
        {row('Last Scan', project.lastScannedAt ?? 'Never')}
        {row('Last Audit', project.lastAuditedAt ?? 'Never')}
        {row('Created', new Date(project.createdAt).toLocaleString())}
      </CardContent>
    </Card>
  );
}
