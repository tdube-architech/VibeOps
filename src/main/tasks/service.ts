import { customAlphabet } from 'nanoid';
import type { Task, TaskInput, TaskListQuery, TaskPatch, AuditFinding, TaskPriority } from '@shared/types';
import type { TasksRepo } from './repo';
import type { AuditsRepo } from '@main/audit/repo';

const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 14);

const SEVERITY_TO_PRIORITY: Record<AuditFinding['severity'], TaskPriority> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: 'low'
};

export class TasksService {
  constructor(
    private readonly repo: TasksRepo,
    private readonly auditsRepo: AuditsRepo
  ) {}

  list(q: TaskListQuery): Task[] { return this.repo.list(q); }
  byId(id: string): Task | null { return this.repo.byId(id); }

  create(input: TaskInput): Task {
    if (!input.title.trim()) throw new Error('Task title required.');
    return this.repo.insert({ id: `tsk_${newId()}`, ...input, title: input.title.trim() });
  }

  createFromFinding(findingId: string): Task {
    const finding = this.findFinding(findingId);
    if (!finding) throw new Error(`finding ${findingId} not found`);
    const input: TaskInput = {
      projectId: finding.projectId,
      title: finding.title,
      sourceFindingId: finding.id,
      priority: SEVERITY_TO_PRIORITY[finding.severity],
      relatedFiles: finding.filePath ? [finding.filePath] : []
    };
    if (finding.description) input.description = finding.description;
    if (finding.recommendation) input.description = `${input.description ?? ''}\n\nRecommendation: ${finding.recommendation}`.trim();
    if (finding.suggestedPrompt) input.suggestedPrompt = finding.suggestedPrompt;
    return this.create(input);
  }

  update(patch: TaskPatch): Task { return this.repo.update(patch); }
  remove(id: string): void { this.repo.remove(id); }

  private findFinding(findingId: string): AuditFinding | null {
    // Search across recent audit runs by finding id. AuditsRepo doesn't expose
    // a direct lookup, so we walk runs by project — but we don't know project here.
    // Workaround: use a direct DB-level query via the audits repo helper.
    return this.auditsRepo.findingById?.(findingId) ?? null;
  }
}
