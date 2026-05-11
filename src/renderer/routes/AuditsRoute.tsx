import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjectList } from '@/features/projects/useProjects';
import { useDashboardSummary } from '@/features/dashboard/useDashboard';
import { EmptyState } from '@/components/EmptyState';
import { relativeTime } from '@/lib/relative-time';

export function AuditsRoute() {
  const { data: projects = [], isLoading } = useProjectList();
  const { data: summary } = useDashboardSummary();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-h1">Audits</h1>
        <p className="text-sm text-muted-foreground">
          Run audits per-project. Click a project to view findings, score, and recommended prompt.
        </p>
      </div>

      {summary?.recentFindings && summary.recentFindings.length > 0 && (() => {
        const all = summary.recentFindings;
        const critCount = all.filter((f) => f.severity === 'critical').length;
        const highCount = all.filter((f) => f.severity === 'high').length;
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Critical/High Findings</CardTitle>
              <CardDescription>
                {critCount} critical, {highCount} high — {all.length} total across all active projects.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {all.map((f) => (
                  <Link
                    key={`${f.auditRunId}-${f.title}`}
                    to={`/projects/${f.projectId}`}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{f.title}</div>
                      <div className="t-meta">
                        {f.projectName} · {new Date(f.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant={f.severity === 'critical' ? 'destructive' : 'warning'}>{f.severity}</Badge>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
                    <div className="t-meta truncate">{p.primaryStack ?? '—'}</div>
                  </div>
                  <div className="t-meta">
                    {p.lastAuditedAt
                      ? <>audited <span title={p.lastAuditedAt}>{relativeTime(p.lastAuditedAt)}</span></>
                      : 'never audited'}
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
