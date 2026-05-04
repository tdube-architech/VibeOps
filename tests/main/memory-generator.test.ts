import { describe, it, expect } from 'vitest';
import { generateMemory } from '@main/memory/generator';
import type { Project, Scan, ScanFile, ScanEnvVar } from '@shared/types';

const project: Project = {
  id: 'p1', name: 'Demo App', slug: 'demo-app',
  description: 'A test app', localPath: 'C:/projects/demo',
  repoUrl: 'https://github.com/example/demo', category: 'internal',
  status: 'active', primaryStack: 'Next.js + React',
  tags: ['mvp', 'internal'],
  createdAt: '2026-05-01T00:00:00Z', updatedAt: '2026-05-04T00:00:00Z',
  lastScannedAt: '2026-05-04T00:00:00Z', lastAuditedAt: null
};

const scan: Scan = {
  id: 's1', projectId: 'p1', status: 'completed',
  summary: 'Next.js Application. Indexed 42 files.',
  detection: {
    projectType: 'Next.js Application', packageManager: 'pnpm',
    frameworks: ['Next.js', 'React', 'Tailwind CSS'],
    database: 'Supabase Postgres', auth: 'Supabase Auth',
    deployment: 'Vercel', primaryStack: 'Next.js + React'
  },
  warnings: [{ code: 'SECRET_FILE_PRESENT', message: '.env present' }],
  fileCount: 42, byteCount: 100_000,
  startedAt: '2026-05-04T00:00:00Z', completedAt: '2026-05-04T00:01:00Z',
  errorMessage: null
};

const files: ScanFile[] = [
  { id: 'f1', projectId: 'p1', scanId: 's1', path: 'package.json', fileType: 'config', sizeBytes: 1000, hash: null, importanceScore: 100, summary: null, lastSeenAt: '2026-05-04' },
  { id: 'f2', projectId: 'p1', scanId: 's1', path: 'app/page.tsx', fileType: 'source', sizeBytes: 500, hash: null, importanceScore: 80, summary: null, lastSeenAt: '2026-05-04' },
  { id: 'f3', projectId: 'p1', scanId: 's1', path: 'README.md', fileType: 'doc', sizeBytes: 200, hash: null, importanceScore: 90, summary: null, lastSeenAt: '2026-05-04' }
];

const envVars: ScanEnvVar[] = [
  { id: 'e1', projectId: 'p1', scanId: 's1', filename: '.env.example', variable: 'DATABASE_URL', required: true, comment: 'Postgres connection' },
  { id: 'e2', projectId: 'p1', scanId: 's1', filename: '.env.example', variable: 'NEXT_PUBLIC_API', required: false, comment: null }
];

describe('generateMemory', () => {
  it('renders project identity', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('# Project Memory: Demo App');
    expect(md).toContain('## 1. Project Identity');
    expect(md).toContain('- Name: Demo App');
    expect(md).toContain('- Local Path: `C:/projects/demo`');
    expect(md).toContain('- Repository: https://github.com/example/demo');
    expect(md).toContain('- Tags: mvp, internal');
  });
  it('renders the detected stack', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('- Frontend: Next.js, React, Tailwind CSS');
    expect(md).toContain('- Database: Supabase Postgres');
    expect(md).toContain('- Auth: Supabase Auth');
    expect(md).toContain('- Hosting: Vercel');
    expect(md).toContain('Package Manager: pnpm');
  });
  it('lists env variable names without values', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toMatch(/\| DATABASE_URL \| Postgres connection \| Yes \|/);
    expect(md).toMatch(/\| NEXT_PUBLIC_API \| .* \| No \|/);
    expect(md).not.toContain('postgres://');
  });
  it('lists key files sorted by importance score', () => {
    const md = generateMemory({ project, scan, files, envVars });
    const idxPkg = md.indexOf('package.json');
    const idxReadme = md.indexOf('README.md');
    const idxApp = md.indexOf('app/page.tsx');
    expect(idxPkg).toBeGreaterThan(0);
    expect(idxPkg).toBeLessThan(idxReadme);
    expect(idxReadme).toBeLessThan(idxApp);
  });
  it('wraps user-editable sections in markers', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('<!-- vibeops:user-editable -->');
    expect(md).toContain('<!-- /vibeops:user-editable -->');
    expect(md).toContain('<!-- vibeops:section:summary -->');
  });
  it('includes a last-audit placeholder when no audit yet', () => {
    const md = generateMemory({ project, scan, files, envVars });
    expect(md).toContain('Last audit date: Never');
  });
  it('handles missing scan gracefully', () => {
    const md = generateMemory({ project, scan: null, files: [], envVars: [] });
    expect(md).toContain('Run a scan to populate this section.');
  });
});
