import { Link } from 'react-router-dom';
import { BookOpen, FileCheck, FileX } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProjectList } from '@/features/projects/useProjects';
import { EmptyState } from '@/components/EmptyState';

export function MemoryRoute() {
  const { data: projects = [], isLoading } = useProjectList();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-h1">Memory</h1>
        <p className="text-sm text-muted-foreground">
          Per-project memory.md status. Click a project to manage its memory.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Projects</CardTitle>
          <CardDescription>Memory generation lives on each project's Memory tab.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-6 w-6" />}
              title="No projects yet"
              description="Add a project on the Dashboard to start generating memory.md files."
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
                    <div className="t-meta truncate">{p.localPath}</div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {p.lastScannedAt ? (
                      <Badge variant="success"><FileCheck className="h-3 w-3" /> scanned</Badge>
                    ) : (
                      <Badge variant="outline"><FileX className="h-3 w-3" /> no scan</Badge>
                    )}
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
