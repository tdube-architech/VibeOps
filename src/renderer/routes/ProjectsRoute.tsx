import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AddProjectButton } from '@/features/projects/AddProjectButton';
import { ProjectTable } from '@/features/projects/ProjectTable';

export function ProjectsRoute() {
  const [includeArchived, setIncludeArchived] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">All registered local project folders.</p>
        </div>
        <AddProjectButton />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>All Projects</span>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
              />
              Include archived
            </Label>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTable includeArchived={includeArchived} />
        </CardContent>
      </Card>
    </div>
  );
}
