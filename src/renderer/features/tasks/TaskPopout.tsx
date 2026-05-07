import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CommentThread } from '@/features/comments/CommentThread';
import { MentionInput } from './MentionInput';
import { AssigneePicker } from './AssigneePicker';
import { WatcherChips } from './WatcherChips';
import { useUpdateTask, useRecordMentions } from './useTasks';
import { toast } from '@/lib/toast';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' }, { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }
];
const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' }, { value: 'next', label: 'Next' },
  { value: 'in_progress', label: 'In Progress' }, { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' }, { value: 'ignored', label: 'Ignored' }
];

export function TaskPopout({
  task, open, onOpenChange
}: { task: Task; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateTask();
  const recordMentions = useRecordMentions();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [pendingMentions, setPendingMentions] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTitle(task.title);
    setDescription(task.description ?? '');
    setPriority(task.priority);
    setStatus(task.status);
    setPendingMentions([]);
  }, [open, task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    update.mutate(
      {
        id: task.id,
        title,
        description: description || null,
        priority,
        status,
        expectedVersion: task.version
      },
      {
        onSuccess: async () => {
          if (pendingMentions.length > 0) {
            try {
              await recordMentions.mutateAsync({ taskId: task.id, userIds: pendingMentions, source: 'description' });
            } catch (e) { console.warn('[mentions]', e); }
          }
          toast.success('Task updated');
          onOpenChange(false);
        }
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Badge variant="outline" className="mr-2">{priority}</Badge>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="inline-block w-auto" />
          </DialogTitle>
          <DialogDescription>Edit task details, assignee, watchers, and comments.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Assignee</Label>
            <AssigneePicker
              value={task.assigneeUserId}
              onChange={(uid) => update.mutate({ id: task.id, assigneeUserId: uid, expectedVersion: task.version })}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Watchers</Label>
            <WatcherChips taskId={task.id} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Description (use @ to mention)</Label>
            <MentionInput
              value={description}
              onChange={setDescription}
              onMentionsChange={setPendingMentions}
              placeholder="Notes, context, or @mention a teammate"
            />
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <Label className="mb-1 block">Comments</Label>
          <CommentThread target="task" targetId={task.id} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
