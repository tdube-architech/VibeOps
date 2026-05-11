import { findingSignature } from '@shared/finding-signature';
import { FINDING_TO_PRIORITY } from '@shared/finding-to-task';
import type { AuditFinding, Task, TaskInput } from '@shared/types';

export interface BridgeDeps {
  listTasks: (q: { projectId: string }) => Promise<Task[]>;
  createTask: (input: TaskInput) => Promise<Task>;
}

export interface BridgeResult {
  created: number;
  skipped: number;
  failed: number;
}

export async function runFindingsBridge(
  deps: BridgeDeps,
  projectId: string,
  findings: AuditFinding[]
): Promise<BridgeResult> {
  if (findings.length === 0) return { created: 0, skipped: 0, failed: 0 };

  const existing = await deps.listTasks({ projectId });
  const existingSigs = new Set<string>();
  for (const t of existing) {
    if (t.sourceSignature) existingSigs.add(t.sourceSignature);
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  const toCreate: TaskInput[] = [];
  for (const f of findings) {
    const priority = FINDING_TO_PRIORITY[f.severity];
    if (priority === null) continue;

    const sig = findingSignature({
      category: f.category,
      title: f.title,
      filePath: f.filePath,
      lineStart: f.lineStart
    });
    if (existingSigs.has(sig)) {
      skipped++;
      continue;
    }
    existingSigs.add(sig);

    const description = [
      f.description ?? '',
      f.recommendation ? `\n\n**Recommendation:** ${f.recommendation}` : ''
    ].filter(Boolean).join('');

    const input: TaskInput = {
      projectId,
      title: f.title,
      priority,
      sourceFindingId: f.id,
      sourceSignature: sig,
      relatedFiles: f.filePath ? [f.filePath] : []
    };
    if (description) input.description = description;
    if (f.suggestedPrompt) input.suggestedPrompt = f.suggestedPrompt;
    toCreate.push(input);
  }

  const results = await Promise.allSettled(toCreate.map((input) => deps.createTask(input)));
  for (const r of results) {
    if (r.status === 'fulfilled') created++;
    else failed++;
  }

  return { created, skipped, failed };
}
