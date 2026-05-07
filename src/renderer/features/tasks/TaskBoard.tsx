import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core';
import { TaskColumn } from './TaskColumn';
import { TrashDock } from './TrashDock';
import { TaskCard } from './TaskCard';
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

const SPACING = 1000;

function computePos(beforePos: number | null, afterPos: number | null): number {
  if (beforePos == null && afterPos == null) return SPACING;
  if (beforePos == null) return (afterPos ?? 2 * SPACING) - SPACING;
  if (afterPos == null) return beforePos + SPACING;
  return (beforePos + afterPos) / 2;
}

export function TaskBoard({ tasks, projectMap }: { tasks: Task[]; projectMap: Map<string, string> }) {
  const update = useUpdateTask();
  const softDelete = useSoftDeleteTask();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeId, setActiveId] = useState<string | null>(null);

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
  const activeTask = activeId ? tasksById.get(activeId) ?? null : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;

    if (overId === 'trash') {
      softDelete.mutate(taskId, {
        onSuccess: () => toast.info('Sent to trash', 'Restorable for 30 days')
      });
      return;
    }

    const current = tasksById.get(taskId);
    if (!current) return;

    let targetStatus: TaskStatus;
    let targetIndex: number;

    if (overId.startsWith('col:')) {
      targetStatus = overId.slice(4) as TaskStatus;
      const list = byStatus.get(targetStatus) ?? [];
      targetIndex = list.length;
    } else {
      const overTask = tasksById.get(overId);
      if (!overTask) return;
      targetStatus = overTask.status;
      const list = byStatus.get(targetStatus) ?? [];
      targetIndex = list.findIndex((t) => t.id === overId);
      if (targetIndex < 0) targetIndex = list.length;
    }

    const targetList = (byStatus.get(targetStatus) ?? []).filter((t) => t.id !== taskId);
    const before = targetList[targetIndex - 1] ?? null;
    const after = targetList[targetIndex] ?? null;
    const newPos = computePos(before?.position ?? null, after?.position ?? null);

    if (current.status === targetStatus && current.position === newPos) return;

    const patch: { id: string; position: number; status?: TaskStatus } = { id: taskId, position: newPos };
    if (current.status !== targetStatus) patch.status = targetStatus;
    update.mutate(patch);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
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
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rotate-2 cursor-grabbing opacity-95 shadow-2xl">
            <TaskCard
              task={activeTask}
              {...(projectMap.get(activeTask.projectId) ? { projectName: projectMap.get(activeTask.projectId)! } : {})}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
