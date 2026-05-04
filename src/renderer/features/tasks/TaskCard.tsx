import { useState } from 'react';
import { Trash2, ChevronRight, Copy, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateTask, useRemoveTask } from './useTasks';
import { toast } from '@/lib/toast';
import type { Task, TaskPriority, TaskStatus } from '@shared/types';

const PRIORITY_BADGE: Record<TaskPriority, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary'
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'next', label: 'Next' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'ignored', label: 'Ignored' }
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

export function TaskCard({ task, projectName }: { task: Task; projectName?: string }) {
  const update = useUpdateTask();
  const remove = useRemoveTask();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (!task.suggestedPrompt) return;
    await navigator.clipboard.writeText(task.suggestedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
              {task.sourceFindingId && <Badge variant="outline">from audit</Badge>}
              <span className="font-medium text-sm">{task.title}</span>
            </div>
            {projectName && <div className="text-xs text-muted-foreground mt-1">{projectName}</div>}
          </div>
          <Select value={task.status} onValueChange={(v) => update.mutate({ id: task.id, status: v as TaskStatus })}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (window.confirm(`Delete task "${task.title}"?`)) {
                remove.mutate(task.id, {
                  onSuccess: () => toast.success('Task deleted')
                });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {expanded && (
          <div className="ml-6 space-y-2 pt-1">
            {task.description && (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">{task.description}</p>
            )}
            {task.relatedFiles.length > 0 && (
              <div className="text-xs">
                <div className="text-muted-foreground mb-1">Related files</div>
                {task.relatedFiles.map((f) => (
                  <div key={f} className="font-mono text-muted-foreground">{f}</div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Priority</span>
              <Select value={task.priority} onValueChange={(v) => update.mutate({ id: task.id, priority: v as TaskPriority })}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {task.suggestedPrompt && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Suggested prompt</span>
                  <Button variant="ghost" size="sm" onClick={copyPrompt}>
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="rounded-md border border-border bg-card/40 p-2 text-[11px] font-mono whitespace-pre-wrap">
{task.suggestedPrompt}
                </pre>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Created {new Date(task.createdAt).toLocaleString()}
              {task.completedAt && ` · Completed ${new Date(task.completedAt).toLocaleString()}`}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
