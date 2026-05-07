import { useDraggable } from '@dnd-kit/core';
import { TaskCard } from './TaskCard';
import type { Task } from '@shared/types';

export function DraggableTaskCard({ task, projectName }: { task: Task; projectName?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={isDragging ? 'opacity-40' : ''}
      style={{ touchAction: 'none' }}
    >
      <TaskCard task={task} {...(projectName ? { projectName } : {})} />
    </div>
  );
}
