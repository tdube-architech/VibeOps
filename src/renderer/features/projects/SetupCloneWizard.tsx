import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderOpen, GitBranch, Search, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { setProjectLocalPath } from '@/lib/data/projects';
import type { Project } from '@shared/types';

const CODE_ROOT_KEY = 'vibeops:code-root';

interface Props {
  project: Project;
  onSetupComplete: (localPath: string) => void;
}

export function SetupCloneWizard({ project, onSetupComplete }: Props) {
  const [codeRoot, setCodeRoot] = useState<string>('');
  const [autoFound, setAutoFound] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneLog, setCloneLog] = useState<string[]>([]);
  const cloneJobIdRef = useRef<string | null>(null);

  const repoUrl = project.repoUrl ?? '';
  const targetName = inferRepoName(repoUrl) ?? project.slug;
  const target = codeRoot ? joinPath(codeRoot, targetName) : '';

  useEffect(() => {
    const stored = window.localStorage.getItem(CODE_ROOT_KEY);
    if (stored) {
      setCodeRoot(stored);
    } else {
      void api.projectsExtra.defaultCodeRoot().then((r) => setCodeRoot(r.root));
    }
  }, []);

  useEffect(() => {
    if (!repoUrl || !codeRoot || searched) return;
    setSearched(true);
    void api.projectsExtra.findClone(repoUrl, [codeRoot]).then((r) => {
      if (r.path) setAutoFound(r.path);
    });
  }, [repoUrl, codeRoot, searched]);

  useEffect(() => {
    return api.projectsExtra.onCloneProgress((evt) => {
      if (evt.jobId !== cloneJobIdRef.current) return;
      setCloneLog((prev) => [...prev, evt.line].filter(Boolean).slice(-200));
      if (evt.done) {
        cloneJobIdRef.current = null;
        setCloning(false);
        if (evt.ok && evt.cwd) {
          void adoptPath(evt.cwd);
        } else {
          toast.error('Clone failed', evt.error ?? 'unknown');
        }
      }
    });
  }, []);

  async function adoptPath(localPath: string): Promise<void> {
    try {
      await setProjectLocalPath(project.id, localPath);
      toast.success('Project linked', `Using ${localPath}`);
      onSetupComplete(localPath);
    } catch (e) {
      toast.error('Could not save path', (e as Error).message);
    }
  }

  async function pickFolder(): Promise<void> {
    const r = await api.projects.pickFolder();
    if (!r.canceled && r.path) await adoptPath(r.path);
  }

  async function chooseCodeRoot(): Promise<void> {
    const r = await api.projects.pickFolder();
    if (!r.canceled && r.path) {
      setCodeRoot(r.path);
      window.localStorage.setItem(CODE_ROOT_KEY, r.path);
      setSearched(false);
    }
  }

  function startClone(): void {
    if (!repoUrl || !target) return;
    setCloning(true);
    setCloneLog([]);
    void api.projectsExtra.cloneStart(repoUrl, target).then((r) => {
      cloneJobIdRef.current = r.jobId;
    }).catch((e) => {
      setCloning(false);
      toast.error('Clone failed', (e as Error).message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          Set up <span className="font-mono">{project.name}</span> on this machine
        </CardTitle>
        <CardDescription>
          Cloud projects live in git. To work on this one locally you need a clone of the repository.
          Pick how you want to set it up.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!repoUrl && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            This project has no <code>repo_url</code> set yet. The owner needs to set a local path
            from a git repo first so VibeOps can capture the remote URL.
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={pickFolder}>
                <FolderOpen className="h-3.5 w-3.5" /> I have a folder anyway
              </Button>
            </div>
          </div>
        )}

        {repoUrl && (
          <>
            <div className="text-xs text-muted-foreground">
              Repository: <code className="break-all">{repoUrl}</code>
            </div>

            {autoFound && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
                <div className="mb-2 flex items-center gap-2">
                  <Search className="h-3.5 w-3.5" />
                  Found an existing clone at <code className="break-all">{autoFound}</code>
                </div>
                <Button size="sm" onClick={() => void adoptPath(autoFound)}>
                  Use this clone
                </Button>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Download className="h-3.5 w-3.5" />
                Clone fresh
              </div>
              <div className="grid gap-2">
                <div>
                  <Label className="text-xs">Code root</Label>
                  <div className="flex gap-2">
                    <Input value={codeRoot} readOnly className="font-mono text-xs" />
                    <Button size="sm" variant="outline" onClick={chooseCodeRoot}>
                      <FolderOpen className="h-3.5 w-3.5" /> Change
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Target</Label>
                  <Input value={target} readOnly className="font-mono text-xs" />
                </div>
              </div>
              <Button size="sm" onClick={startClone} disabled={cloning || !target}>
                {cloning ? 'Cloning…' : 'Clone now'}
              </Button>
              {cloneLog.length > 0 && (
                <pre className="max-h-40 overflow-auto rounded bg-black/40 p-2 font-mono text-[10px] leading-tight text-muted-foreground">
                  {cloneLog.join('')}
                </pre>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Already have it somewhere else?{' '}
              <Button variant="link" className="h-auto p-0 text-xs" onClick={pickFolder}>
                Pick the folder
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function inferRepoName(repoUrl: string): string | null {
  if (!repoUrl) return null;
  const m = /([^/:]+?)(?:\.git)?$/.exec(repoUrl.trim().replace(/\/+$/, ''));
  return m && m[1] ? m[1] : null;
}

function joinPath(root: string, name: string): string {
  if (!root) return name;
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.replace(/[\\/]$/, '') + sep + name;
}
