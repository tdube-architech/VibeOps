import { describe, it, expect } from 'vitest';
import { detectAll, type DetectorContext } from '@main/scanner/detectors';

function ctx(over: Partial<DetectorContext> = {}): DetectorContext {
  return {
    rootDir: '/fake',
    files: [],
    readText: () => null,
    ...over
  } as DetectorContext;
}

describe('detectAll', () => {
  it('detects pnpm via lockfile', () => {
    const r = detectAll(ctx({ files: ['pnpm-lock.yaml', 'package.json'] }));
    expect(r.packageManager).toBe('pnpm');
  });
  it('detects yarn via lockfile', () => {
    const r = detectAll(ctx({ files: ['yarn.lock', 'package.json'] }));
    expect(r.packageManager).toBe('yarn');
  });
  it('detects npm via package-lock.json', () => {
    const r = detectAll(ctx({ files: ['package-lock.json', 'package.json'] }));
    expect(r.packageManager).toBe('npm');
  });
  it('detects pip via requirements.txt', () => {
    const r = detectAll(ctx({ files: ['requirements.txt'] }));
    expect(r.packageManager).toBe('pip');
  });
  it('detects Next.js via next.config + dep', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'next.config.js', 'app/page.tsx'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { next: '14.0.0' } }) : null
    }));
    expect(r.frameworks).toContain('Next.js');
    expect(r.projectType).toBe('Next.js Application');
  });
  it('detects Vite + React', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'vite.config.ts', 'src/main.tsx'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { react: '^18' }, devDependencies: { vite: '^5' } }) : null
    }));
    expect(r.frameworks).toContain('Vite');
    expect(r.frameworks).toContain('React');
  });
  it('detects FastAPI', () => {
    const r = detectAll(ctx({
      files: ['pyproject.toml', 'main.py', 'requirements.txt'],
      readText: (p) => p === 'requirements.txt' ? 'fastapi==0.110\nuvicorn==0.30' : null
    }));
    expect(r.frameworks).toContain('FastAPI');
    expect(r.projectType).toContain('FastAPI');
  });
  it('detects Supabase + Postgres + Supabase Auth', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'supabase/config.toml', 'supabase/migrations/0001_init.sql'],
      readText: (p) =>
        p === 'package.json' ? JSON.stringify({ dependencies: { '@supabase/supabase-js': '^2' } }) : null
    }));
    expect(r.database).toBe('Supabase Postgres');
    expect(r.auth).toBe('Supabase Auth');
  });
  it('detects Prisma + Postgres', () => {
    const r = detectAll(ctx({
      files: ['prisma/schema.prisma'],
      readText: (p) => p === 'prisma/schema.prisma' ? 'datasource db { provider = "postgresql" url = env("DATABASE_URL") }' : null
    }));
    expect(r.database).toBe('Prisma + PostgreSQL');
  });
  it('detects Vercel', () => {
    const r = detectAll(ctx({ files: ['vercel.json', 'package.json'] }));
    expect(r.deployment).toBe('Vercel');
  });
  it('detects Netlify', () => {
    const r = detectAll(ctx({ files: ['netlify.toml'] }));
    expect(r.deployment).toBe('Netlify');
  });
  it('detects Docker Compose', () => {
    const r = detectAll(ctx({ files: ['docker-compose.yml'] }));
    expect(r.deployment).toBe('Docker Compose');
  });
  it('falls back to nulls when nothing detected', () => {
    const r = detectAll(ctx({ files: ['random.txt'] }));
    expect(r.packageManager).toBeNull();
    expect(r.frameworks).toEqual([]);
    expect(r.database).toBeNull();
  });
  it('builds primaryStack short label', () => {
    const r = detectAll(ctx({
      files: ['package.json', 'next.config.js'],
      readText: (p) => p === 'package.json' ? JSON.stringify({ dependencies: { next: '14', react: '18' } }) : null
    }));
    expect(r.primaryStack).toBe('Next.js + React');
  });
});
