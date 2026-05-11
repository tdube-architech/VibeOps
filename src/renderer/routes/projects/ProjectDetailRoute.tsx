import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Archive, Trash2, RotateCcw, Share2 } from 'lucide-react';
import { ShareProjectDialog } from '@/features/projects/ShareProjectDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useProject, useArchiveProject, useUnarchiveProject, useRemoveProject } from '@/features/projects/useProjects';
import { useAutoScan } from '@/features/projects/useAutoScan';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectScanTab } from './ProjectScanTab';
import { ProjectMemoryTab } from './ProjectMemoryTab';
import { ProjectAuditsTab } from './ProjectAuditsTab';
import { ProjectCodeMapTab } from './ProjectCodeMapTab';
import { ProjectGitTab } from './ProjectGitTab';
import { ProjectTerminalTab } from './ProjectTerminalTab';
import { ProjectDesignTab } from './ProjectDesignTab';
import { useProjectRealtime } from '@/lib/data/realtime';
import { useProjectActivity } from '@/lib/data/projectActivity';
import { ActivityPanel } from '@/features/projects/ActivityPanel';
import { RepoAccessPanel } from '@/features/projects/RepoAccessPanel';
import { PresenceStack } from '@/features/presence/PresenceStack';

export function ProjectDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id);
  useProjectRealtime(id);
  useAutoScan(project ?? undefined);
  const isCloud = project?.source !== 'local' && Boolean(project?.localPath);
  useProjectActivity(isCloud ? project?.id : null, isCloud ? project?.localPath : null);
  const archive = useArchiveProject();
  const unarchive = useUnarchiveProject();
  const remove = useRemoveProject();
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
        <div className="flex items-center gap-3">
          {project.source !== 'local' && <PresenceStack projectId={project.id} />}
        </div>
        <div className="flex gap-2">
          {project.source !== 'local' && (
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
          )}
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
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="design">Design</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="space-y-3">
            {isCloud && <RepoAccessPanel project={project} />}
            {isCloud && <ActivityPanel projectId={project.id} />}
            <ProjectOverviewTab project={project} />
          </div>
        </TabsContent>
        <TabsContent value="scan"><ProjectScanTab project={project} /></TabsContent>
        <TabsContent value="memory"><ProjectMemoryTab project={project} /></TabsContent>
        <TabsContent value="audits"><ProjectAuditsTab project={project} /></TabsContent>
        <TabsContent value="code"><ProjectCodeMapTab project={project} /></TabsContent>
        <TabsContent value="git"><ProjectGitTab project={project} /></TabsContent>
        <TabsContent value="terminal"><ProjectTerminalTab project={project} /></TabsContent>
        <TabsContent value="design"><ProjectDesignTab project={project} /></TabsContent>
      </Tabs>

      <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
      {project.source !== 'local' && (
        <ShareProjectDialog
          projectId={project.id}
          projectName={project.name}
          visibility={project.visibility ?? 'workspace'}
          open={shareOpen}
          onOpenChange={setShareOpen}
        />
      )}
    </div>
  );
}
