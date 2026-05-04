import type { Project, Scan, ScanFile } from '@shared/types';

export interface ChatContextInput {
  project: Project;
  scan: Scan | null;
  files: ScanFile[];
  memory: string | null;
}

export function buildProjectChatContext(input: ChatContextInput): string {
  const { project, scan, files, memory } = input;
  const top = [...files].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 25);
  const lines: string[] = [];
  lines.push(`# Project: ${project.name}`);
  if (project.description) lines.push(`Description: ${project.description}`);
  if (project.primaryStack) lines.push(`Primary stack: ${project.primaryStack}`);
  lines.push('');
  lines.push('## Latest scan');
  if (!scan) {
    lines.push('No scan available — ask the user to run a scan.');
  } else {
    lines.push(scan.summary ?? '(no summary)');
    if (scan.detection.frameworks.length) lines.push(`Frameworks: ${scan.detection.frameworks.join(', ')}`);
    if (scan.detection.database) lines.push(`Database: ${scan.detection.database}`);
    if (scan.detection.auth) lines.push(`Auth: ${scan.detection.auth}`);
    if (scan.detection.deployment) lines.push(`Deployment: ${scan.detection.deployment}`);
  }
  lines.push('');
  lines.push('## Top files (paths only)');
  for (const f of top) lines.push(`- ${f.path} (${f.fileType}, importance ${f.importanceScore})`);
  if (memory) {
    lines.push('');
    lines.push('## memory.md');
    lines.push(memory);
  }
  return lines.join('\n');
}
