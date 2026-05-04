import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const stats = [
  { label: 'Total Projects', value: '0' },
  { label: 'Needs Audit', value: '0' },
  { label: 'Critical Findings', value: '0' },
  { label: 'Memory Current', value: '0' }
];

export function DashboardRoute() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">High-level view of all VibeOps projects.</p>
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
        <CardHeader>
          <CardTitle>Project Workspace</CardTitle>
          <CardDescription>Project list will appear here once Phase 1 ships.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No projects yet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
