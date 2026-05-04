import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';
import { useProjectList } from '@/features/projects/useProjects';

export function DashboardRoute() {
  const { data: projects = [] } = useProjectList({ includeArchived: true });
  const stats = [
    { label: 'Total Projects', value: projects.length },
    { label: 'Active', value: projects.filter((p) => p.status === 'active').length },
    { label: 'Archived', value: projects.filter((p) => p.status === 'archived').length },
    { label: 'Critical', value: projects.filter((p) => p.status === 'critical').length }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
        </div>
        <AddProjectButton />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-3xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Project Workspace</CardTitle></CardHeader>
        <CardContent><ProjectTable /></CardContent>
      </Card>
    </div>
  );
}
