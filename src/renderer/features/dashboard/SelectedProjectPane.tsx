import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProjectOverviewTab } from '@/routes/projects/ProjectOverviewTab';
import { ProjectScanTab } from '@/routes/projects/ProjectScanTab';
import { ProjectMemoryTab } from '@/routes/projects/ProjectMemoryTab';
import { ProjectAuditsTab } from '@/routes/projects/ProjectAuditsTab';
import { ProjectCodeMapTab } from '@/routes/projects/ProjectCodeMapTab';
import { useProject } from '@/features/projects/useProjects';
import { useSelectedProjectId } from '@/features/projects/selectedProject';
import { EmptyState } from '@/components/EmptyState';
import { FolderKanban } from 'lucide-react';

export function SelectedProjectPane() {
  const id = useSelectedProjectId();
  const { data: project } = useProject(id ?? undefined);

  if (!id || !project) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selected Project</CardTitle>
          <CardDescription>Pick a row in the table.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState icon={<FolderKanban className="h-6 w-6" />} title="No project selected" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
        <CardDescription>{project.description ?? project.localPath}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="memory">Memory</TabsTrigger>
            <TabsTrigger value="audits">Audits</TabsTrigger>
            <TabsTrigger value="code">Code Map</TabsTrigger>
            <TabsTrigger value="scan">Scan</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><ProjectOverviewTab project={project} /></TabsContent>
          <TabsContent value="memory"><ProjectMemoryTab project={project} /></TabsContent>
          <TabsContent value="audits"><ProjectAuditsTab project={project} /></TabsContent>
          <TabsContent value="code"><ProjectCodeMapTab project={project} /></TabsContent>
          <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
