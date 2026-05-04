import { describe, it, expect } from 'vitest';
import { buildProjectChatContext } from '@main/chat/context';
import type { Project, Scan, ScanFile } from '@shared/types';

const project: Project = {
  id: 'p', name: 'Demo', slug: 'demo', description: 'Bookings',
  localPath: 'C:/d', repoUrl: null, category: null, status: 'active',
  primaryStack: 'Next.js + React', tags: [], createdAt: '', updatedAt: '',
  lastScannedAt: null, lastAuditedAt: null, workspaceId: 'ws_local'
};
const scan: Scan = {
  id: 's', projectId: 'p', status: 'completed',
  summary: 'Indexed 10 files.',
  detection: { projectType: 'Next.js Application', frameworks: ['Next.js'], packageManager: 'pnpm', database: null, auth: null, deployment: null, primaryStack: 'Next.js + React' },
  warnings: [], fileCount: 10, byteCount: 1, startedAt: '', completedAt: '', errorMessage: null
};
const files: ScanFile[] = [
  { id: '1', projectId: 'p', scanId: 's', path: 'package.json', fileType: 'config', sizeBytes: 1, hash: null, importanceScore: 100, summary: null, lastSeenAt: '' },
  { id: '2', projectId: 'p', scanId: 's', path: 'app/page.tsx', fileType: 'source', sizeBytes: 1, hash: null, importanceScore: 80, summary: null, lastSeenAt: '' }
];

describe('buildProjectChatContext', () => {
  it('includes project name, scan summary, top files', () => {
    const text = buildProjectChatContext({ project, scan, files, memory: '# memory' });
    expect(text).toContain('Demo');
    expect(text).toContain('Indexed 10 files.');
    expect(text).toContain('package.json');
    expect(text).toContain('# memory');
  });

  it('caps top files at 25', () => {
    const many: ScanFile[] = Array.from({ length: 50 }, (_, i) => ({
      ...files[0]!, id: `f${i}`, path: `src/file${i}.ts`, importanceScore: 50
    }));
    const text = buildProjectChatContext({ project, scan, files: many, memory: null });
    const matches = text.match(/src\/file\d+\.ts/g) ?? [];
    expect(matches.length).toBeLessThanOrEqual(25);
  });

  it('handles missing scan and memory', () => {
    const text = buildProjectChatContext({ project, scan: null, files: [], memory: null });
    expect(text).toContain('Demo');
    expect(text).toContain('No scan available');
  });
});
