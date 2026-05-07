import { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/EmptyState';
import { AddTaskDialog } from '@/features/tasks/AddTaskDialog';
import { TaskBoard } from '@/features/tasks/TaskBoard';
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar';
import { TaskPopout } from '@/features/tasks/TaskPopout';
import { useTaskList } from '@/features/tasks/useTasks';
import { useProjectList } from '@/features/projects/useProjects';

export function TasksRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialAssignee = params.get('assignee');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'me' | string>(
    initialAssignee === 'me' ? 'me' : initialAssignee ?? 'all'
  );

  useEffect(() => {
    const next = new URLSearchParams(location.search);
    if (assigneeFilter === 'all') next.delete('assignee');
    else next.set('assignee', assigneeFilter);
    const search = next.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  }, [assigneeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: projects = [] } = useProjectList();
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const query: Parameters<typeof useTaskList>[0] = {};
  if (projectFilter !== 'all') query.projectId = projectFilter;
  if (assigneeFilter === 'me') query.assignee = 'me';
  else if (assigneeFilter !== 'all') query.assignee = assigneeFilter;

  const { data: tasks = [], isLoading } = useTaskList(query);

  // Deep-link: ?task=<id> auto-opens the popout for that task once it loads.
  const deepLinkTaskId = params.get('task');
  const deepLinkTask = deepLinkTaskId ? tasks.find((t) => t.id === deepLinkTaskId) ?? null : null;
  const [popOpen, setPopOpen] = useState(!!deepLinkTaskId);
  useEffect(() => { if (deepLinkTaskId) setPopOpen(true); }, [deepLinkTaskId]);
  function onPopOpenChange(o: boolean) {
    setPopOpen(o);
    if (!o && deepLinkTaskId) {
      const next = new URLSearchParams(location.search);
      next.delete('task');
      const search = next.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="t-h1">Tasks</h1>
          <p className="text-sm text-muted-foreground">Drag tasks between columns. Drop on the trash to delete.</p>
        </div>
        <AddTaskDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center justify-between gap-3">
            <TaskFilterBar value={assigneeFilter} onChange={setAssigneeFilter} />
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
              title="No tasks"
              description="Click Add Task above, or open a project's Audits tab and convert findings into tasks."
            />
          </CardContent>
        </Card>
      ) : (
        <TaskBoard tasks={tasks} projectMap={projectMap} />
      )}

      {deepLinkTask && (
        <TaskPopout task={deepLinkTask} open={popOpen} onOpenChange={onPopOpenChange} />
      )}
    </div>
  );
}
