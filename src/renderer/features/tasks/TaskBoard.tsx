import { useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { TaskColumn } from './TaskColumn';
import { TrashDock } from './TrashDock';
import { useUpdateTask, useSoftDeleteTask } from './useTasks';
import { toast } from '@/lib/toast';
import type { Task, TaskStatus } from '@shared/types';

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'next', label: 'Next' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' }
];

export function TaskBoard({ tasks, projectMap }: { tasks: Task[]; projectMap: Map<string, string> }) {
  const update = useUpdateTask();
  const softDelete = useSoftDeleteTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const c of COLUMNS) map.set(c.status, []);
    for (const t of tasks) {
      const list = map.get(t.status);
      if (list) list.push(t);
    }
    return map;
  }, [tasks]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    if (overId === 'trash') {
      softDelete.mutate(taskId, {
        onSuccess: () => toast.info('Sent to trash', 'Restorable for 30 days')
      });
      return;
    }
    if (overId.startsWith('col:')) {
      const next = overId.slice(4) as TaskStatus;
      const current = tasksById.get(taskId);
      if (!current || current.status === next) return;
      update.mutate({ id: taskId, status: next, expectedVersion: current.version });
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {COLUMNS.map((c) => (
          <TaskColumn
            key={c.status}
            status={c.status}
            label={c.label}
            items={byStatus.get(c.status) ?? []}
            projectMap={projectMap}
          />
        ))}
      </div>
      <TrashDock />
    </DndContext>
  );
}
