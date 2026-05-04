import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardSummary } from '@shared/types';

export function StatCards({ summary }: { summary: DashboardSummary | undefined }) {
  const totals = summary?.totals;
  const tiles = [
    { label: 'Total Projects', value: totals?.projects ?? '—' },
    { label: 'Needs Audit', value: totals?.needsAudit ?? '—' },
    { label: 'Critical Findings', value: totals?.criticalFindings ?? '—' },
    { label: 'Memory Current', value: totals?.memoryCurrent ?? '—' }
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label}>
          <CardHeader className="pb-2">
            <CardDescription>{t.label}</CardDescription>
            <CardTitle className="text-3xl">{t.value}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
      ))}
    </div>
  );
}
