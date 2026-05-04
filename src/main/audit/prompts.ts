import { randomUUID } from 'node:crypto';
import type { GeneratedPrompt, AuditFinding, Project } from '@shared/types';

export interface BuildPromptArgs {
  project: Project;
  topFinding: AuditFinding | null;
  topPromptTitle?: string;
  topPromptType?: string;
  topPromptGoal?: string;
}

export function buildSafePrompt(args: BuildPromptArgs): { prompt: GeneratedPrompt; content: string } {
  const goal = args.topPromptGoal ??
    (args.topFinding
      ? `Resolve the top audit finding: "${args.topFinding.title}".`
      : 'Improve project quality based on the latest VibeOps audit.');

  const fileHints = args.topFinding?.filePath ? [args.topFinding.filePath] : [];

  const content = [
    `You are working inside ${args.project.name}.`,
    '',
    'Before doing anything:',
    '1. Read memory.md.',
    '2. Inspect only the relevant files listed below.',
    '3. Do not make broad rewrites.',
    '',
    `Goal:`,
    goal,
    '',
    'Rules:',
    '- Do not redesign the UI unless asked.',
    '- Do not change authentication unless required.',
    '- Do not modify database schema without explaining why.',
    '- Do not remove existing functionality.',
    '- Make the smallest safe change.',
    '- Summarize every modified file.',
    '',
    'Relevant Files:',
    ...(fileHints.length > 0 ? fileHints.map((p) => `- ${p}`) : ['- (use memory.md and recent scan output to pick files)']),
    '',
    'Expected Behavior:',
    args.topFinding?.recommendation ?? 'Address the recommendation from the audit; if unclear, propose a plan first.',
    '',
    'Validation:',
    '- Run typecheck if available.',
    '- Run tests if available.',
    '- Report any commands that fail.'
  ].join('\n');

  const prompt: GeneratedPrompt = {
    id: `prm_${randomUUID()}`,
    projectId: args.project.id,
    auditRunId: null,
    title: args.topPromptTitle ?? (args.topFinding ? `Address: ${args.topFinding.title}` : 'Next-step prompt'),
    promptType: args.topPromptType ?? 'fix-bug',
    content,
    status: 'unused',
    outcomeNotes: null,
    createdAt: new Date().toISOString(),
    usedAt: null
  };

  return { prompt, content };
}
