import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TerminalView } from '@/features/terminal/TerminalView';
import { SpectatorPanel } from '@/features/terminal/SpectatorPanel';
import { DiffReviewPanel } from '@/features/terminal/DiffReviewPanel';
import { SetupCloneWizard } from '@/features/projects/SetupCloneWizard';
import type { Project } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OwnerContext { aiSessionId: string; cwd: string; sessionStartSha: string | null }

type GridSize = 1 | 4 | 9 | 16;
const GRID_OPTIONS: GridSize[] = [1, 4, 9, 16];

function gridCols(size: GridSize): number {
  return Math.sqrt(size);
}

export function ProjectTerminalTab({ project }: { project: Project }) {
  const [owners, setOwners] = useState<Record<number, OwnerContext>>({});
  const [grid, setGrid] = useState<GridSize>(1);
  const qc = useQueryClient();
  const isCloud = UUID_RE.test(project.id) && Boolean(project.workspaceId);

  if (!project.localPath) {
    if (isCloud) {
      return (
        <SetupCloneWizard
          project={project}
          onSetupComplete={() => {
            qc.invalidateQueries({ queryKey: ['projects'] });
            qc.invalidateQueries({ queryKey: ['projects', project.id] });
          }}
        />
      );
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Terminal</CardTitle>
          <CardDescription>
            Set a local path for this project on this machine before opening a terminal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const cellIdxs = Array.from({ length: grid }, (_, i) => i);
  const cols = gridCols(grid);
  // Surface DiffReviewPanel for the most recently created session (highest cell index with an owner).
  const latestOwner = cellIdxs
    .slice()
    .reverse()
    .map((i) => owners[i])
    .find((o): o is OwnerContext => Boolean(o));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Terminal</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Layout</span>
              {GRID_OPTIONS.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={grid === g ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    setGrid(g);
                    setOwners((prev) => {
                      const next: Record<number, OwnerContext> = {};
                      for (const [k, v] of Object.entries(prev)) {
                        if (Number(k) < g) next[Number(k)] = v;
                      }
                      return next;
                    });
                  }}
                >
                  {gridCols(g)}×{gridCols(g)}
                </Button>
              ))}
            </div>
          </CardTitle>
          <CardDescription>
            Spawn shells or AI CLIs rooted in <code className="text-xs">{project.localPath}</code>.
            {isCloud
              ? ' Output streams to teammates in real time. Pop a tile out to a separate window for focused work.'
              : ' Output streams locally only — migrate the project to share with teammates.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${cols}, minmax(0, 1fr))`
            }}
          >
            {cellIdxs.map((i) => (
              <div key={`${grid}-${i}`} className="rounded-md border border-border p-2">
                <TerminalView
                  cwd={project.localPath}
                  {...(isCloud
                    ? {
                        cloud: { projectId: project.id, workspaceId: project.workspaceId },
                        onAiSessionChange: (info) => {
                          setOwners((prev) => {
                            const next = { ...prev };
                            if (info) next[i] = info;
                            else delete next[i];
                            return next;
                          });
                        }
                      }
                    : {})}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {isCloud && latestOwner && (
        <DiffReviewPanel
          sessionId={latestOwner.aiSessionId}
          ownerContext={{ cwd: latestOwner.cwd, sessionStartSha: latestOwner.sessionStartSha }}
        />
      )}
      {isCloud && <SpectatorPanel projectId={project.id} />}
    </div>
  );
}
