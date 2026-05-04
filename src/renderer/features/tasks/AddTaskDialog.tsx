import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProjectList } from '@/features/projects/useProjects';
import { useCreateTask } from './useTasks';
import { toast } from '@/lib/toast';
import type { TaskPriority } from '@shared/types';

export function AddTaskDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [error, setError] = useState<string | null>(null);
  const { data: projects = [] } = useProjectList();
  const create = useCreateTask();

  function reset() {
    setTitle(''); setDescription(''); setProjectId(undefined);
    setPriority('medium'); setError(null);
  }

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Title required.');
    if (!projectId) return setError('Pick a project.');
    try {
      await create.mutateAsync({
        projectId,
        title: title.trim(),
        priority,
        ...(description.trim() ? { description: description.trim() } : {})
      });
      toast.success('Task created');
      setOpen(false);
      reset();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Task</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>Manual task. To convert an audit finding into a task, use the Findings table on a project.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={projectId ?? ''} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Select a project" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
