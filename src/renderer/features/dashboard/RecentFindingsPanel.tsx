import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardSummary } from '@shared/types';

export function RecentFindingsPanel({ summary }: { summary: DashboardSummary | undefined }) {
  const findings = summary?.recentFindings ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Critical/High Findings</CardTitle>
        <CardDescription>Top 20 across all active projects.</CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <div className="text-sm text-muted-foreground">No critical or high findings yet.</div>
        ) : (
          <div className="space-y-1">
            {findings.map((f) => (
              <Link
                key={`${f.auditRunId}-${f.title}`}
                to={`/projects/${f.projectId}`}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2 hover:bg-secondary/40"
              >
                <div>
                  <div className="font-medium text-sm">{f.title}</div>
                  <div className="text-xs text-muted-foreground">{f.projectName}</div>
                </div>
                <Badge variant={f.severity === 'critical' ? 'destructive' : 'warning'}>{f.severity}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
