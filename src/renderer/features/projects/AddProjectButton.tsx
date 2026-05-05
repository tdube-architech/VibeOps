import { useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAddProject } from './useProjects';
import { DuplicatePathDialog } from './DuplicatePathDialog';
import type { Project, ProjectInput } from '@shared/types';

interface FormState {
  name: string;
  description: string;
  category: string;
  tags: string;
  localPath: string;
}

const empty: FormState = { name: '', description: '', category: '', tags: '', localPath: '' };

export function AddProjectButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [duplicate, setDuplicate] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addMut = useAddProject();

  function reset() {
    setForm(empty);
    setError(null);
    setDuplicate(null);
  }

  async function pickFolder() {
    setError(null);
    const result = await api.projects.pickFolder();
    if (!result.canceled && result.path) {
      setForm((f) => ({
        ...f,
        localPath: result.path!,
        name: f.name || result.path!.split(/[\\/]/).pop() || ''
      }));
    }
  }

  function buildInput(): ProjectInput {
    const desc = form.description.trim();
    const cat = form.category.trim();
    const input: ProjectInput = {
      name: form.name.trim(),
      localPath: form.localPath.trim(),
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean)
    };
    if (desc) input.description = desc;
    if (cat) input.category = cat;
    return input;
  }

  async function submit(allowDuplicate = false) {
    setError(null);
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.localPath.trim()) return setError('Pick a folder.');
    try {
      const project = await addMut.mutateAsync({ input: buildInput(), allowDuplicate });
      setOpen(false);
      reset();
      toast.success(`Added ${project.name}`, 'Auto-pipeline starting…');
      void api.pipeline.run(project.id, {}, { localPath: project.localPath, name: project.name }).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error('Failed to start auto-pipeline', msg);
      });
    } catch (err) {
      const e = err as Error & { code?: string; meta?: { existing?: Project } };
      if (e.code === 'DUPLICATE_PATH' && e.meta?.existing) {
        setDuplicate(e.meta.existing);
        return;
      }
      setError(e.message ?? 'Failed to add project.');
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add Project
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Project</DialogTitle>
            <DialogDescription>Register a local folder. VibeOps does not modify or copy files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="folder">Folder</Label>
              <div className="flex gap-2">
                <Input id="folder" readOnly value={form.localPath} placeholder="C:\path\to\project" />
                <Button type="button" variant="outline" onClick={pickFolder}>
                  <Folder className="h-4 w-4" /> Browse
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="cat">Category</Label>
                <Input id="cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={() => submit(false)} disabled={addMut.isPending}>
              {addMut.isPending ? 'Adding…' : 'Add Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DuplicatePathDialog
        existing={duplicate}
        onCancel={() => setDuplicate(null)}
        onConfirm={() => { setDuplicate(null); void submit(true); }}
      />
    </>
  );
}
