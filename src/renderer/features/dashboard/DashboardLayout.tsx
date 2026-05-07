import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';
import { StatCards } from '@/features/dashboard/StatCards';
import { RecentFindingsPanel } from '@/features/dashboard/RecentFindingsPanel';
import { HighestRiskPanel } from '@/features/dashboard/HighestRiskPanel';
import { SelectedProjectPane } from './SelectedProjectPane';
import { DashboardChatPreview } from '@/features/chat/DashboardChatPreview';
import { useDashboardSummary } from '@/features/dashboard/useDashboard';

export function DashboardLayout() {
  const { data: summary } = useDashboardSummary();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="t-h1">Dashboard</h1>
          <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
        </div>
        <AddProjectButton />
      </div>
      <StatCards summary={summary} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Project Workspace</CardTitle></CardHeader>
            <CardContent><ProjectTable /></CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RecentFindingsPanel summary={summary} />
            <DashboardChatPreview />
          </div>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <SelectedProjectPane />
          <HighestRiskPanel summary={summary} />
        </div>
      </div>
    </div>
  );
}
