import { useDroppable } from '@dnd-kit/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DraggableTaskCard } from './DraggableTaskCard';
import type { Task, TaskStatus } from '@shared/types';

export function TaskColumn({
  status, label, items, projectMap
}: {
  status: TaskStatus;
  label: string;
  items: Task[];
  projectMap: Map<string, string>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <Card className={`lg:col-span-1 ${isOver ? 'ring-2 ring-primary/60' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{label}</span>
          <span className="text-xs text-muted-foreground">{items.length}</span>
        </CardTitle>
        <CardDescription className="sr-only">Tasks in {label}</CardDescription>
      </CardHeader>
      <CardContent ref={setNodeRef} className="space-y-2 min-h-24">
        {items.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">—</div>
        ) : (
          items.map((t) => (
            <DraggableTaskCard
              key={t.id}
              task={t}
              {...(projectMap.get(t.projectId) ? { projectName: projectMap.get(t.projectId)! } : {})}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
