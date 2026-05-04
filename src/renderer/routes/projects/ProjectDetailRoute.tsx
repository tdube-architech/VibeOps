import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Archive, Trash2, RotateCcw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useProject, useArchiveProject, useUnarchiveProject, useRemoveProject } from '@/features/projects/useProjects';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectScanTab } from './ProjectScanTab';
import { ProjectMemoryTab } from './ProjectMemoryTab';
import { ProjectAuditsTab } from './ProjectAuditsTab';
import { ProjectCodeMapTab } from './ProjectCodeMapTab';

export function ProjectDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id);
  const archive = useArchiveProject();
  const unarchive = useUnarchiveProject();
  const remove = useRemoveProject();
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="text-sm text-muted-foreground">Project not found.</div>;

  async function onRemove() {
    if (!project) return;
    const yes = window.confirm(
      `Remove "${project.name}" from VibeOps? Local files at ${project.localPath} will not be deleted.`
    );
    if (!yes) return;
    await remove.mutateAsync(project.id);
    navigate('/projects');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {project.status === 'archived' ? (
            <Button variant="outline" size="sm" onClick={() => unarchive.mutate(project.id)}>
              <RotateCcw className="h-4 w-4" /> Unarchive
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => archive.mutate(project.id)}>
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="scan">Scan</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
          <TabsTrigger value="audits">Audits</TabsTrigger>
          <TabsTrigger value="code">Code Map</TabsTrigger>
        </TabsList>
        <TabsContent value="overview"><ProjectOverviewTab project={project} /></TabsContent>
        <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
        <TabsContent value="memory"><ProjectMemoryTab project={project} /></TabsContent>
        <TabsContent value="audits"><ProjectAuditsTab project={project} /></TabsContent>
        <TabsContent value="code"><ProjectCodeMapTab project={project} /></TabsContent>
      </Tabs>

      <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
