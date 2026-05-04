import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuditScoreRing } from '@/features/projects/AuditScoreRing';
import { riskLabelFromScore } from '@/lib/risk';
import type { DashboardSummary } from '@shared/types';

export function HighestRiskPanel({ summary }: { summary: DashboardSummary | undefined }) {
  const target = summary?.highestRiskProject;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Highest Risk Project</CardTitle>
        <CardDescription>Lowest-scoring active project from latest audits.</CardDescription>
      </CardHeader>
      <CardContent>
        {!target ? (
          <div className="text-sm text-muted-foreground">No audits yet.</div>
        ) : (
          <Link to={`/projects/${target.id}`} className="flex items-center gap-4 rounded-md border border-border p-3 hover:bg-secondary/40">
            <AuditScoreRing score={target.score} risk={riskLabelFromScore(target.score)} />
            <div>
              <div className="font-medium">{target.name}</div>
              <div className="text-xs text-muted-foreground">Click to open project</div>
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
