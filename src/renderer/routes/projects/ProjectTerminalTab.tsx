import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TerminalView } from '@/features/terminal/TerminalView';
import { SpectatorPanel } from '@/features/terminal/SpectatorPanel';
import { DiffReviewPanel } from '@/features/terminal/DiffReviewPanel';
import type { Project } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OwnerContext { aiSessionId: string; cwd: string; sessionStartSha: string | null }

export function ProjectTerminalTab({ project }: { project: Project }) {
  const [owner, setOwner] = useState<OwnerContext | null>(null);

  if (!project.localPath) {
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
  const isCloud = UUID_RE.test(project.id) && Boolean(project.workspaceId);
  const cloudProps = isCloud
    ? {
        cloud: { projectId: project.id, workspaceId: project.workspaceId },
        onAiSessionChange: setOwner
      }
    : {};
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>Terminal</CardTitle>
          <CardDescription>
            Spawn a shell or AI CLI rooted in <code className="text-xs">{project.localPath}</code>.
            {isCloud
              ? ' Output streams to teammates in real time. File changes inside the project are tracked for review.'
              : ' Output streams locally only — migrate the project to share with teammates.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TerminalView cwd={project.localPath} {...cloudProps} />
        </CardContent>
      </Card>
      {isCloud && owner && (
        <DiffReviewPanel
          sessionId={owner.aiSessionId}
          ownerContext={{ cwd: owner.cwd, sessionStartSha: owner.sessionStartSha }}
        />
      )}
      {isCloud && <SpectatorPanel projectId={project.id} />}
    </div>
  );
}
