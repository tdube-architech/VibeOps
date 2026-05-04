import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjectList } from '@/features/projects/useProjects';
import { useDashboardSummary } from '@/features/dashboard/useDashboard';
import { EmptyState } from '@/components/EmptyState';

export function AuditsRoute() {
  const { data: projects = [], isLoading } = useProjectList();
  const { data: summary } = useDashboardSummary();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audits</h1>
        <p className="text-sm text-muted-foreground">
          Run audits per-project. Click a project to view findings, score, and recommended prompt.
        </p>
      </div>

      {summary?.recentFindings && summary.recentFindings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Critical/High Findings</CardTitle>
            <CardDescription>Across all active projects in this workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {summary.recentFindings.slice(0, 10).map((f) => (
                <Link
                  key={`${f.auditRunId}-${f.title}`}
                  to={`/projects/${f.projectId}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{f.title}</div>
                    <div className="text-xs text-muted-foreground">{f.projectName}</div>
                  </div>
                  <Badge variant={f.severity === 'critical' ? 'destructive' : 'warning'}>{f.severity}</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Projects</CardTitle>
          <CardDescription>Open a project to run a new audit.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" />}
              title="No projects yet"
              description="Add a project on the Dashboard, scan it, then run an audit."
            />
          ) : (
            <div className="space-y-1">
              {projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.primaryStack ?? '—'}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.lastAuditedAt ? `audited ${new Date(p.lastAuditedAt).toLocaleDateString()}` : 'never audited'}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
