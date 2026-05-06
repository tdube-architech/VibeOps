import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { TerminalView } from '@/features/terminal/TerminalView';
import { getSupabase } from '@/lib/supabase';

interface ProjectStub {
  id: string;
  workspaceId: string;
  name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chrome-less route mounted by the BrowserWindow that the main process spawns
 * when the user clicks "Pop out" on a terminal tile. Hosts a single TerminalView
 * pointed at the project's cwd; the main window keeps running its own.
 */
export function PopoutTerminalRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const [params] = useSearchParams();
  const cwd = params.get('cwd') ?? '';
  const [project, setProject] = useState<ProjectStub | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !UUID_RE.test(projectId)) {
      setError('Invalid project id');
      return;
    }
    const supabase = getSupabase();
    void supabase
      .from('projects')
      .select('id, workspace_id, name')
      .eq('id', projectId)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) { setError(e.message); return; }
        if (!data) { setError('Project not found'); return; }
        const row = data as { id: string; workspace_id: string; name: string };
        setProject({ id: row.id, workspaceId: row.workspace_id, name: row.name });
      });
  }, [projectId]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-destructive">
        {error}
      </div>
    );
  }
  if (!project || !cwd) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col gap-2 bg-background p-3">
      <div className="text-xs text-muted-foreground">
        {project.name} · <code>{cwd}</code>
      </div>
      <div className="flex-1 overflow-hidden">
        <TerminalView
          cwd={cwd}
          cloud={{ projectId: project.id, workspaceId: project.workspaceId }}
          hidePopout
        />
      </div>
    </div>
  );
}
