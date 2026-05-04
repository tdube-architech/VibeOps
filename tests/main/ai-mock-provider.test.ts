import { describe, it, expect } from 'vitest';
import { mockProviderFactory } from '@main/ai/providers/mock';
import type { ProjectAnalysisInput } from '@shared/ai';

const input: ProjectAnalysisInput = {
  project: { id: 'p1', name: 'Demo', localPath: 'C:/d', description: null, primaryStack: 'Next.js + React' },
  scanSummary: 'Indexed 10 files.',
  detection: {
    projectType: 'Next.js Application',
    frameworks: ['Next.js', 'React'],
    packageManager: 'pnpm', database: 'Supabase Postgres',
    auth: 'Supabase Auth', deployment: 'Vercel'
  },
  topFiles: [
    { path: 'package.json', type: 'config', importance: 100 },
    { path: 'app/page.tsx', type: 'source', importance: 80 }
  ],
  envVarNames: ['DATABASE_URL'],
  warnings: [{ code: 'SECRET_FILE_PRESENT', message: '.env present' }]
};

describe('mock provider', () => {
  it('produces an analysis with required fields', async () => {
    const p = mockProviderFactory.build({ apiKey: null, defaultModel: 'mock' });
    const out = await p.analyzeProject(input, {});
    expect(out.summary).toContain('Mock analysis of Demo');
    expect(out.notableFiles).toHaveLength(2);
    expect(out.risks[0]).toContain('SECRET_FILE_PRESENT');
    expect(out.trace.providerId).toBe('mock');
  });
  it('reports ok=true from testConnection', async () => {
    const p = mockProviderFactory.build({ apiKey: null, defaultModel: 'mock' });
    const r = await p.testConnection({});
    expect(r.ok).toBe(true);
  });
});
