import type { DraftFinding } from '../findings';
import type { Scan, ScanFile } from '@shared/types';

export interface ArchitectureContext {
  scan: Scan;
  files: ScanFile[];
}

export function checkArchitecture(ctx: ArchitectureContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  if (ctx.scan.detection.frameworks.length === 0) {
    out.push({
      severity: 'low', category: 'architecture',
      title: 'No frontend or backend framework detected',
      description: 'The scanner could not identify a primary framework.',
      recommendation: 'If this project uses an unusual setup, document the entrypoint and architecture in memory.md so future agents can reason about it.'
    });
  }

  const docs = ctx.files.filter((f) => f.fileType === 'doc');
  if (docs.length === 0) {
    out.push({
      severity: 'low', category: 'documentation',
      title: 'No documentation files detected',
      description: 'No README.md, CLAUDE.md, AGENTS.md, or docs/* found.',
      recommendation: 'Add at least a top-level README and run the VibeOps memory generator.'
    });
  }

  if (ctx.scan.detection.frameworks.includes('Next.js')) {
    const hasApp = ctx.files.some((f) => f.path.startsWith('app/'));
    const hasPages = ctx.files.some((f) => f.path.startsWith('pages/'));
    if (hasApp && hasPages) {
      out.push({
        severity: 'medium', category: 'architecture',
        title: 'Next.js project mixes /app and /pages directories',
        description: 'Both routing styles exist. This is a common AI-generated mix that confuses Next.js routing.',
        recommendation: 'Pick one router and migrate the rest. Document the choice in memory.md.'
      });
    }
  }

  return out;
}
