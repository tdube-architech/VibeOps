import { useState } from 'react';
import { ChevronRight, Copy, Check, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateTask, useTaskCommentSummary } from './useTasks';
import { CommentThread } from '@/features/comments/CommentThread';
import { TaskPopout } from './TaskPopout';
import type { Task, TaskPriority } from '@shared/types';

const PRIORITY_BADGE: Record<TaskPriority, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary'
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' }
];

export function TaskCard({ task, projectName }: { task: Task; projectName?: string }) {
  const update = useUpdateTask();
  const { data: summaries } = useTaskCommentSummary();
  const summary = summaries?.get(task.id);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [popOpen, setPopOpen] = useState(false);

  async function copyPrompt() {
    if (!task.suggestedPrompt) return;
    await navigator.clipboard.writeText(task.suggestedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <>
    <Card onDoubleClick={() => setPopOpen(true)}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
              {task.sourceFindingId && <Badge variant="outline">from audit</Badge>}
              <span className="font-medium text-sm">{task.title}</span>
              {summary && summary.total > 0 && <CommentBubble summary={summary} />}
            </div>
            {projectName && <div className="text-xs text-muted-foreground mt-1">{projectName}</div>}
          </div>
        </div>

        {expanded && (
          <div className="ml-6 space-y-2 pt-1" onDoubleClick={(e) => e.stopPropagation()}>
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
              <Select value={task.priority} onValueChange={(v) => update.mutate({ id: task.id, priority: v as TaskPriority, expectedVersion: task.version })}>
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
            <div className="border-t border-border/40 pt-2">
              <CommentThread target="task" targetId={task.id} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <TaskPopout task={task} open={popOpen} onOpenChange={setPopOpen} />
    </>
  );
}

function CommentBubble({ summary }: { summary: { total: number; unread: number } }) {
  const hasUnread = summary.unread > 0;
  const label = hasUnread ? summary.unread : summary.total;
  return (
    <span
      title={hasUnread ? `${summary.unread} unread of ${summary.total}` : `${summary.total} comment${summary.total === 1 ? '' : 's'}`}
      className={[
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
        hasUnread
          ? 'bg-primary text-primary-foreground animate-pulse shadow-[0_0_10px_2px_hsl(var(--primary)/0.7)] ring-1 ring-primary/60'
          : 'bg-secondary text-muted-foreground'
      ].join(' ')}
    >
      <MessageSquare className="h-3 w-3" />
      {label}
    </span>
  );
}
