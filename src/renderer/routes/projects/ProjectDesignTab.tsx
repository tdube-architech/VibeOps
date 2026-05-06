import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/toast';
import { listCanvases, createCanvas, renameCanvas, deleteCanvas } from '@/lib/data/designCanvas';
import { DesignCanvas } from '@/features/design/DesignCanvas';
import type { Project } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  project: Project;
}

export function ProjectDesignTab({ project }: Props) {
  const isCloud = UUID_RE.test(project.id) && Boolean(project.workspaceId);
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const list = useQuery({
    queryKey: ['canvases', project.id],
    queryFn: () => listCanvases(project.id),
    enabled: isCloud
  });

  useEffect(() => {
    if (!activeId && list.data && list.data.length > 0) {
      setActiveId(list.data[0]!.id);
    }
  }, [list.data, activeId]);

  const create = useMutation({
    mutationFn: () => createCanvas({
      projectId: project.id,
      workspaceId: project.workspaceId,
      name: `Canvas ${(list.data?.length ?? 0) + 1}`
    }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['canvases', project.id] });
      setActiveId(c.id);
    },
    onError: (e) => toast.error('Could not create canvas', (e as Error).message)
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameCanvas(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canvases', project.id] });
      setRenaming(null);
    }
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCanvas(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canvases', project.id] });
      if (activeId && !list.data?.some((c) => c.id !== activeId)) setActiveId(null);
    }
  });

  if (!isCloud) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Design canvas</CardTitle>
          <CardDescription>
            Migrate this project to the cloud to enable collaborative design canvases.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Design canvases</span>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              <Plus className="h-4 w-4" /> New canvas
            </Button>
          </CardTitle>
          <CardDescription>
            Real-time collaborative diagrams. Drag blocks, connect them, take notes — your team
            sees changes as you make them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {list.data && list.data.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {list.data.map((c) => (
                <div key={c.id} className="flex items-center gap-1">
                  {renaming === c.id ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-7 w-40 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') rename.mutate({ id: c.id, name: renameValue.trim() || c.name });
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                      />
                      <Button size="sm" variant="ghost"
                        onClick={() => rename.mutate({ id: c.id, name: renameValue.trim() || c.name })}>
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant={activeId === c.id ? 'default' : 'outline'}
                        onClick={() => setActiveId(c.id)}
                      >
                        {c.name}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => { setRenaming(c.id); setRenameValue(c.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={() => {
                          if (window.confirm(`Delete canvas "${c.name}"? This removes all nodes.`)) {
                            remove.mutate(c.id);
                          }
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No canvases yet — create one to start sketching the architecture.
            </div>
          )}
        </CardContent>
      </Card>

      {activeId && <DesignCanvas canvasId={activeId} />}
    </div>
  );
}
