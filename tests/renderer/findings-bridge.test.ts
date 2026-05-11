import { describe, it, expect, vi } from 'vitest';
import { runFindingsBridge } from '../../src/renderer/features/tasks/findingsBridge';
import { findingSignature } from '../../src/shared/finding-signature';
import type { AuditFinding, Task, TaskInput } from '../../src/shared/types';

function makeFinding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: 'fnd_' + Math.random().toString(36).slice(2),
    auditRunId: 'aud_x',
    projectId: 'proj_x',
    severity: 'medium',
    category: 'security',
    title: 'Hardcoded API key',
    description: null,
    filePath: 'app/page.tsx',
    lineStart: 12,
    lineEnd: null,
    recommendation: null,
    suggestedPrompt: null,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...over
  } as AuditFinding;
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 'tsk_' + Math.random().toString(36).slice(2),
    projectId: 'proj_x',
    sourceFindingId: null,
    sourceSignature: null,
    title: 't',
    description: null,
    priority: 'medium',
    status: 'backlog',
    assigneeUserId: null,
    relatedFiles: [],
    suggestedPrompt: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    deletedAt: null,
    position: null,
    ...over
  };
}

describe('runFindingsBridge', () => {
  it('creates tasks for actionable findings; skips info', async () => {
    const created: TaskInput[] = [];
    const listTasks = vi.fn().mockResolvedValue([]);
    const createTask = vi.fn(async (input: TaskInput) => { created.push(input); return makeTask({ projectId: input.projectId, title: input.title }); });

    const findings = [
      makeFinding({ severity: 'info', title: 'Stack: Next 14' }),
      makeFinding({ severity: 'medium', title: 'Missing rate limit' }),
      makeFinding({ severity: 'critical', title: 'SQL injection' })
    ];

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', findings);

    expect(result).toEqual({ created: 2, skipped: 0, failed: 0 });
    expect(created.map(c => c.title).sort()).toEqual(['Missing rate limit', 'SQL injection']);
    expect(created.find(c => c.title === 'SQL injection')?.priority).toBe('critical');
  });

  it('skips findings whose signature matches an existing non-trashed task', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const sig = findingSignature({ category: f.category, title: f.title, filePath: f.filePath, lineStart: f.lineStart });
    const existing = makeTask({ sourceSignature: sig, status: 'backlog' });
    const listTasks = vi.fn().mockResolvedValue([existing]);
    const createTask = vi.fn();

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 0, skipped: 1, failed: 0 });
    expect(createTask).not.toHaveBeenCalled();
  });

  it('skips when matching task is in done or ignored status', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const sig = findingSignature({ category: f.category, title: f.title, filePath: f.filePath, lineStart: f.lineStart });
    const existing = makeTask({ sourceSignature: sig, status: 'done' });
    const listTasks = vi.fn().mockResolvedValue([existing]);
    const createTask = vi.fn();

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 0, skipped: 1, failed: 0 });
  });

  it('does NOT see trashed tasks (listTasks excludes them) — creates new', async () => {
    const f = makeFinding({ title: 'Missing rate limit' });
    const listTasks = vi.fn().mockResolvedValue([]);
    const createTask = vi.fn(async (input: TaskInput) => makeTask({ title: input.title }));

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [f]);

    expect(result).toEqual({ created: 1, skipped: 0, failed: 0 });
  });

  it('counts failed creates but continues with remaining findings', async () => {
    const fA = makeFinding({ title: 'A', lineStart: 1 });
    const fB = makeFinding({ title: 'B', lineStart: 2 });
    const listTasks = vi.fn().mockResolvedValue([]);
    const createTask = vi.fn()
      .mockImplementationOnce(() => Promise.reject(new Error('RLS')))
      .mockImplementationOnce(async (input: TaskInput) => makeTask({ title: input.title }));

    const result = await runFindingsBridge({ listTasks, createTask }, 'proj_x', [fA, fB]);

    expect(result).toEqual({ created: 1, skipped: 0, failed: 1 });
  });

  it('returns zero counts for empty findings', async () => {
    const result = await runFindingsBridge({ listTasks: vi.fn().mockResolvedValue([]), createTask: vi.fn() }, 'proj_x', []);
    expect(result).toEqual({ created: 0, skipped: 0, failed: 0 });
  });
});
