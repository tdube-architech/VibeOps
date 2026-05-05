import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DashboardSummary } from '@shared/types';

const VISIBLE_COUNT = 10;

export function RecentFindingsPanel({ summary }: { summary: DashboardSummary | undefined }) {
  const findings = summary?.recentFindings ?? [];
  const visible = findings.slice(0, VISIBLE_COUNT);
  const hasMore = findings.length > VISIBLE_COUNT;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Critical/High Findings</CardTitle>
        <CardDescription>
          {findings.length === 0
            ? 'No critical or high findings yet.'
            : `Showing ${visible.length} of ${findings.length} across all active projects.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {findings.length === 0 ? (
          <div className="text-sm text-muted-foreground">No critical or high findings yet.</div>
        ) : (
          <>
            <div className="space-y-1">
              {visible.map((f) => (
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
            {hasMore && (
              <div className="mt-3 flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <Link to="/audits">
                    View all findings <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
