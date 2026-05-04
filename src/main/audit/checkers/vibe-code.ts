import type { DraftFinding } from '../findings';
import type { ScanFile } from '@shared/types';
import path from 'node:path';

export interface VibeContext {
  files: ScanFile[];
  readText: (relPath: string) => string | null;
}

const TODO_RE = /\b(?:TODO|FIXME|XXX|HACK)\b/g;
const LARGE_FILE_BYTES = 200_000;

export function checkVibeCode(ctx: VibeContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  const byBase = new Map<string, ScanFile[]>();
  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    const base = path.posix.basename(f.path).toLowerCase();
    if (!base.endsWith('.tsx') && !base.endsWith('.jsx')) continue;
    const list = byBase.get(base) ?? [];
    list.push(f);
    byBase.set(base, list);
  }
  for (const [base, list] of byBase) {
    if (list.length >= 2) {
      out.push({
        severity: 'medium',
        category: 'vibe-code-quality',
        title: `Duplicate component name: ${base}`,
        description: `Found ${list.length} files named "${base}":\n${list.map((f) => `- ${f.path}`).join('\n')}`,
        recommendation: 'Pick one canonical implementation, remove the rest, and update imports.'
      });
    }
  }

  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    const text = ctx.readText(f.path);
    if (!text) continue;
    const todos = text.match(TODO_RE)?.length ?? 0;
    if (todos >= 5) {
      out.push({
        severity: 'low',
        category: 'vibe-code-quality',
        title: `TODO-heavy file: ${f.path} (${todos} markers)`,
        description: 'Many TODO/FIXME/XXX/HACK markers — likely incomplete logic.',
        filePath: f.path,
        recommendation: 'Triage each marker: fix it, file a task, or delete the dead branch.'
      });
    }
  }

  for (const f of ctx.files) {
    if (f.fileType !== 'source') continue;
    if (f.sizeBytes > LARGE_FILE_BYTES) {
      out.push({
        severity: 'low',
        category: 'vibe-code-quality',
        title: `Large file: ${f.path}`,
        description: `${(f.sizeBytes / 1024).toFixed(1)} KB. Likely doing too much.`,
        filePath: f.path,
        recommendation: 'Split into focused modules where it makes sense.'
      });
    }
  }

  return out;
}
