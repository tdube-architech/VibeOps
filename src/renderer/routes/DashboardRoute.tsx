import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';
import { StatCards } from '@/features/dashboard/StatCards';
import { RecentFindingsPanel } from '@/features/dashboard/RecentFindingsPanel';
import { HighestRiskPanel } from '@/features/dashboard/HighestRiskPanel';
import { useDashboardSummary } from '@/features/dashboard/useDashboard';
import { ActivityFeed } from '@/features/activity/ActivityFeed';

export function DashboardRoute() {
  const { data: summary, isLoading } = useDashboardSummary();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
        </div>
        <AddProjectButton />
      </div>
      <StatCards summary={summary} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Project Workspace</CardTitle></CardHeader>
            <CardContent><ProjectTable /></CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          <HighestRiskPanel summary={summary} />
          <RecentFindingsPanel summary={summary} />
          <ActivityFeed />
        </div>
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading dashboard…</div>}
    </div>
  );
}
