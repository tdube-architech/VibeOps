import { useEffect, useState } from 'react';
import { Eye, FileText, Pencil, RefreshCw, Save, Sparkles, FolderOpen } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MemoryViewer } from '@/features/projects/MemoryViewer';
import { MemoryEditor } from '@/features/projects/MemoryEditor';
import { MemoryWriteDialog } from '@/features/projects/MemoryWriteDialog';
import {
  useGenerateDraft, useSaveDraft, useWriteMemoryFile,
  useMemoryFileStatus, useLatestMemory, useMemoryVersions, useOpenMemoryInEditor
} from '@/features/projects/useMemory';
import type { Project, Memory } from '@shared/types';

type Mode = 'view' | 'edit';

export function ProjectMemoryTab({ project }: { project: Project }) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<string>('');
  const [draftDirty, setDraftDirty] = useState(false);
  const [writeOpen, setWriteOpen] = useState(false);
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: latest } = useLatestMemory(project.id);
  const { data: versions = [] } = useMemoryVersions(project.id);
  const { data: fileStatus } = useMemoryFileStatus(project.id);
  const generate = useGenerateDraft();
  const save = useSaveDraft();
  const write = useWriteMemoryFile();
  const openExternal = useOpenMemoryInEditor();

  useEffect(() => {
    if (!draftDirty && latest?.content) setDraft(latest.content);
  }, [latest?.content, draftDirty]);

  async function onGenerate(refresh: boolean) {
    setError(null);
    try {
      const d = await generate.mutateAsync({
        projectId: project.id,
        mode: refresh ? 'merge-with-disk' : 'fresh',
        localPath: project.localPath,
        name: project.name
      });
      setDraft(d.content);
      setDraftDirty(true);
      setMode('view');
    } catch (e) { setError((e as Error).message); }
  }

  async function onSave() {
    setError(null);
    try {
      const m = await save.mutateAsync({ projectId: project.id, content: draft, source: 'user-edited' });
      setDraftDirty(false);
      setPendingMemoryId(m.id);
    } catch (e) { setError((e as Error).message); }
  }

  async function onWriteFile() {
    setError(null);
    let memoryId = pendingMemoryId;
    if (!memoryId || draftDirty) {
      const m = await save.mutateAsync({
        projectId: project.id, content: draft,
        source: draftDirty ? 'user-edited' : 'generated'
      });
      memoryId = m.id;
      setPendingMemoryId(memoryId);
      setDraftDirty(false);
    }
    setWriteOpen(true);
  }

  async function confirmWrite() {
    if (!pendingMemoryId) return;
    setWriteOpen(false);
    try {
      await write.mutateAsync({ projectId: project.id, memoryId: pendingMemoryId, localPath: project.localPath, name: project.name });
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Project Memory</CardTitle>
            <CardDescription>
              {fileStatus?.exists
                ? <>memory.md present · {(fileStatus.sizeBytes ?? 0) / 1024 < 1 ? '<1' : ((fileStatus.sizeBytes ?? 0) / 1024).toFixed(1)} KB · modified {fileStatus.modifiedAt?.slice(0, 10)}</>
                : 'No memory.md on disk yet.'}
              {latest && <> · DB version {latest.version}</>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode('view')} disabled={mode === 'view'}>
              <Eye className="h-4 w-4" /> View
            </Button>
            <Button variant="outline" size="sm" onClick={() => setMode('edit')} disabled={mode === 'edit'}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => onGenerate(false)} disabled={generate.isPending}>
              <Sparkles className="h-4 w-4" /> {generate.isPending ? 'Generating…' : 'Generate'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => onGenerate(true)} disabled={generate.isPending}>
              <RefreshCw className="h-4 w-4" /> Refresh from disk
            </Button>
            <Button variant="outline" size="sm" onClick={onSave} disabled={!draftDirty || save.isPending}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button onClick={onWriteFile} disabled={!draft || write.isPending}>
              <FileText className="h-4 w-4" /> {write.isPending ? 'Writing…' : 'Write memory.md'}
            </Button>
            {fileStatus?.exists && (
              <Button variant="ghost" size="sm" onClick={() => openExternal.mutate(project.id)}>
                <FolderOpen className="h-4 w-4" /> Open externally
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 text-sm text-destructive">{error}</div>}
          {!draft && !generate.isPending && (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No draft yet. Click <span className="font-medium">Generate</span> to build one from the latest scan, or
              <span className="font-medium"> Refresh from disk</span> to merge with an existing memory.md.
            </div>
          )}
          {draft && mode === 'view' && <MemoryViewer markdown={draft} />}
          {draft && mode === 'edit' && (
            <MemoryEditor value={draft} onChange={(next) => { setDraft(next); setDraftDirty(true); }} />
          )}
        </CardContent>
      </Card>

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version History</CardTitle>
            <CardDescription>Every save and every file write is captured.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {versions.slice(0, 10).map((v: Memory) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="font-medium">v{v.version} · {v.source}</div>
                    <div className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    {v.fileWritten && <Badge variant="success">written</Badge>}
                    <Button variant="ghost" size="sm" onClick={() => { setDraft(v.content); setDraftDirty(false); setMode('view'); }}>
                      Load
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <MemoryWriteDialog
        open={writeOpen}
        fileStatus={fileStatus ?? null}
        onOpenChange={setWriteOpen}
        onConfirm={confirmWrite}
      />
    </div>
  );
}
