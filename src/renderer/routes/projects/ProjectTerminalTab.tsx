import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Plus, ExternalLink } from 'lucide-react';
import { TerminalView } from '@/features/terminal/TerminalView';
import { SpectatorPanel } from '@/features/terminal/SpectatorPanel';
import { DiffReviewPanel } from '@/features/terminal/DiffReviewPanel';
import { SetupCloneWizard } from '@/features/projects/SetupCloneWizard';
import { api } from '@/lib/api';
import {
  useCells, addCell, removeCell, setTargetCount, ensureProjectInitialized,
  updateCellSession, type PersistedCell
} from '@/features/terminal/terminalStore';
import type { Project } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAYOUT_PRESETS: Array<{ label: string; count: number }> = [
  { label: '1×1', count: 1 },
  { label: '2×2', count: 4 },
  { label: '3×3', count: 9 },
  { label: '4×4', count: 16 }
];

function colsFor(n: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(n)));
}

export function ProjectTerminalTab({ project }: { project: Project }) {
  const qc = useQueryClient();
  const isCloud = UUID_RE.test(project.id) && Boolean(project.workspaceId);
  const [poppedOut, setPoppedOut] = useState<Record<string, true>>({});

  // Lazily initialize the project's cell list to a single empty cell.
  useEffect(() => {
    if (project.localPath) ensureProjectInitialized(project.id);
  }, [project.id, project.localPath]);

  const cells = useCells(project.localPath ? project.id : null);

  // Listen for pop-out window close events to un-hide the originating cell.
  useEffect(() => {
    return api.terminal.onPopoutClosed((evt) => {
      if (!evt.aiSessionId) return;
      setPoppedOut((prev) => {
        const next = { ...prev };
        for (const [cellId] of Object.entries(prev)) {
          const cell = cells.find((c) => c.id === cellId);
          if (cell?.aiSessionId === evt.aiSessionId) delete next[cellId];
        }
        return next;
      });
    });
  }, [cells]);

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

  const cols = colsFor(Math.max(1, cells.length));
  const latestOwner = [...cells]
    .reverse()
    .find((c): c is PersistedCell & { aiSessionId: string } => Boolean(c.aiSessionId));

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Terminal</span>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Layout</span>
              {LAYOUT_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant={cells.length === p.count ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => {
                    if (p.count < cells.length) {
                      const ok = window.confirm(
                        `Close ${cells.length - p.count} terminal cell(s)? Their sessions will end.`
                      );
                      if (!ok) return;
                    }
                    setTargetCount(project.id, p.count);
                  }}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => addCell(project.id)}
                disabled={cells.length >= 16}
              >
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            Spawn shells or AI CLIs rooted in <code className="text-xs">{project.localPath}</code>.
            {isCloud
              ? ' Sessions persist across page changes — only × ends them. Pop a tile out to a separate window; the session keeps running.'
              : ' Output streams locally only — migrate the project to share with teammates.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {cells.map((cell, idx) => {
              const isPopped = Boolean(poppedOut[cell.id]);
              const attach = cell.localTerminalId && cell.aiSessionId
                ? {
                    localTerminalId: cell.localTerminalId,
                    aiSessionId: cell.aiSessionId,
                    sessionStartSha: cell.sessionStartSha
                  }
                : undefined;
              return (
                <div key={cell.id} className="relative rounded-md border border-border p-2">
                  <button
                    onClick={() => removeCell(project.id, cell.id)}
                    className="absolute right-1 top-1 z-10 rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                    title="End this terminal session"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {isPopped && (
                    <div className="absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-md bg-background/95 text-center text-xs text-muted-foreground">
                      <ExternalLink className="h-5 w-5 text-amber-400" />
                      <div className="font-medium text-foreground">
                        Terminal #{idx + 1} popped out
                      </div>
                      <div>
                        Running in a separate window. Close that window to bring it back here,
                        or click × to end the session.
                      </div>
                    </div>
                  )}
                  <div style={{ visibility: isPopped ? 'hidden' : 'visible' }}>
                    <TerminalView
                      cwd={project.localPath}
                      terminalNumber={idx + 1}
                      keepSessionOnUnmount
                      {...(attach ? { attach } : {})}
                      {...(isCloud
                        ? {
                            cloud: { projectId: project.id, workspaceId: project.workspaceId },
                            onAiSessionChange: (info) => {
                              if (info) {
                                updateCellSession(project.id, cell.id, {
                                  aiSessionId: info.aiSessionId,
                                  localTerminalId: null, // refreshed by TerminalView's own ref tracking
                                  sessionStartSha: info.sessionStartSha
                                });
                                // attach hook will publish localTerminalId via onLocalSessionChange below
                              } else {
                                updateCellSession(project.id, cell.id, {
                                  aiSessionId: null,
                                  localTerminalId: null,
                                  sessionStartSha: null
                                });
                              }
                            },
                            onLocalSessionChange: (id) => {
                              updateCellSession(project.id, cell.id, { localTerminalId: id });
                            },
                            onPopOutRequested: () => {
                              setPoppedOut((p) => ({ ...p, [cell.id]: true }));
                            }
                          }
                        : {})}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {isCloud && latestOwner && (
        <DiffReviewPanel
          sessionId={latestOwner.aiSessionId}
          ownerContext={{
            cwd: project.localPath,
            sessionStartSha: latestOwner.sessionStartSha
          }}
        />
      )}
      {isCloud && <SpectatorPanel projectId={project.id} />}
    </div>
  );
}
