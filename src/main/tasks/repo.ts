import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projectTasks, type ProjectTaskRow } from '@main/db/schema';
import type { Task, TaskInput, TaskListQuery, TaskPatch, TaskPriority, TaskStatus } from '@shared/types';

function toTask(row: ProjectTaskRow): Task {
  let files: string[] = [];
  try {
    const parsed = JSON.parse(row.relatedFiles ?? '[]');
    if (Array.isArray(parsed)) files = parsed.filter((s): s is string => typeof s === 'string');
  } catch { /* ignore */ }
  return {
    id: row.id,
    projectId: row.projectId,
    sourceFindingId: row.sourceFindingId,
    title: row.title,
    description: row.description,
    priority: row.priority as TaskPriority,
    status: row.status as TaskStatus,
    assigneeUserId: null,
    relatedFiles: files,
    suggestedPrompt: row.suggestedPrompt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    deletedAt: null,
    position: null
  };
}

export class TasksRepo {
  constructor(private readonly db: Db) {}

  insert(args: { id: string } & TaskInput): Task {
    const now = new Date().toISOString();
    this.db.insert(projectTasks).values({
      id: args.id,
      projectId: args.projectId,
      sourceFindingId: args.sourceFindingId ?? null,
      title: args.title,
      description: args.description ?? null,
      priority: args.priority ?? 'medium',
      status: 'backlog',
      relatedFiles: JSON.stringify(args.relatedFiles ?? []),
      suggestedPrompt: args.suggestedPrompt ?? null,
      createdAt: now,
      completedAt: null
    }).run();
    return this.byId(args.id)!;
  }

  byId(id: string): Task | null {
    const row = this.db.select().from(projectTasks).where(eq(projectTasks.id, id)).get();
    return row ? toTask(row) : null;
  }

  list(q: TaskListQuery): Task[] {
    const conditions = [];
    if (q.projectId) conditions.push(eq(projectTasks.projectId, q.projectId));
    if (q.status && q.status !== 'all') conditions.push(eq(projectTasks.status, q.status));
    if (q.priority && q.priority !== 'all') conditions.push(eq(projectTasks.priority, q.priority));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = where
      ? this.db.select().from(projectTasks).where(where).orderBy(desc(projectTasks.createdAt)).all()
      : this.db.select().from(projectTasks).orderBy(desc(projectTasks.createdAt)).all();
    return rows.map(toTask);
  }

  update(patch: TaskPatch): Task {
    const set: Partial<ProjectTaskRow> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.priority !== undefined) set.priority = patch.priority;
    if (patch.status !== undefined) {
      set.status = patch.status;
      if (patch.status === 'done' || patch.status === 'ignored') {
        set.completedAt = new Date().toISOString();
      } else {
        set.completedAt = null;
      }
    }
    if (patch.relatedFiles !== undefined) set.relatedFiles = JSON.stringify(patch.relatedFiles);
    if (patch.suggestedPrompt !== undefined) set.suggestedPrompt = patch.suggestedPrompt;
    this.db.update(projectTasks).set(set).where(eq(projectTasks.id, patch.id)).run();
    const row = this.byId(patch.id);
    if (!row) throw new Error(`task ${patch.id} not found after update`);
    return row;
  }

  remove(id: string): void {
    this.db.delete(projectTasks).where(eq(projectTasks.id, id)).run();
  }
}
