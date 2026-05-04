import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/EmptyState';
import { TaskCard } from '@/features/tasks/TaskCard';
import { AddTaskDialog } from '@/features/tasks/AddTaskDialog';
import { useTaskList } from '@/features/tasks/useTasks';
import { useProjectList } from '@/features/projects/useProjects';
import type { TaskStatus } from '@shared/types';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'next', label: 'Next' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' }
];

export function TasksRoute() {
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const { data: projects = [] } = useProjectList();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const { data: tasks = [], isLoading } = useTaskList(projectFilter === 'all' ? {} : { projectId: projectFilter });

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, typeof tasks>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const t of tasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Manual tasks and audit-finding follow-ups across all projects.</p>
        </div>
        <AddTaskDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-3">
            <span>Filter</span>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <span className="text-muted-foreground">Project</span>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Label>
          </CardTitle>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              icon={<ListChecks className="h-6 w-6" />}
              title="No tasks yet"
              description="Click Add Task above, or open a project's Audits tab and convert findings into tasks."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {COLUMNS.map((c) => {
            const items = byStatus.get(c.status) ?? [];
            return (
              <Card key={c.status} className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{c.label}</span>
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </CardTitle>
                  <CardDescription className="sr-only">Tasks in {c.label}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">—</div>
                  ) : (
                    items.map((t) => (
                      <TaskCard key={t.id} task={t} {...(projectMap.get(t.projectId) ? { projectName: projectMap.get(t.projectId)! } : {})} />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
