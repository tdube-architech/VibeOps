import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pino from 'pino';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';
import { ProjectsService } from '@main/projects/service';
import { ScansRepo } from '@main/scanner/repo';
import { runScan } from '@main/scanner';

const logger = pino({ level: 'silent' });

let workdir: string;
let dbFile: string;
let projectDir: string;

function writeFiles(root: string, files: Array<[string, string]>) {
  for (const [rel, content] of files) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-scan-e2e-'));
  dbFile = path.join(workdir, 'db.sqlite');
  projectDir = path.join(workdir, 'next-supabase');
  fs.mkdirSync(projectDir, { recursive: true });
  writeFiles(projectDir, [
    ['package.json', JSON.stringify({
      name: 'demo',
      dependencies: { next: '14.0.0', react: '18.0.0', '@supabase/supabase-js': '^2' },
      devDependencies: { tailwindcss: '^3' }
    })],
    ['next.config.js', 'module.exports = {}'],
    ['app/page.tsx', 'export default function Page(){return null}'],
    ['app/api/health/route.ts', 'export const GET = () => new Response("ok")'],
    ['supabase/config.toml', '[project]\nname="demo"\n'],
    ['supabase/migrations/0001_init.sql', 'CREATE TABLE users(id uuid);'],
    ['vercel.json', '{"version":2}'],
    ['.env.example', '# Public URL\nNEXT_PUBLIC_API=https://api.example\n# Required\nDATABASE_URL=postgres://demo\n'],
    ['.env', 'SECRET=do-not-read'],
    ['README.md', '# Demo']
  ]);
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe('runScan end-to-end', () => {
  it('persists a completed scan with full detection', async () => {
    const handle = openDb(dbFile);
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });

    const { scan } = await runScan(
      { scansRepo, projectsService, logger },
      { projectId: project.id, emitter: null }
    );

    expect(scan.status).toBe('completed');
    expect(scan.detection.primaryStack).toBe('Next.js + React');
    expect(scan.detection.packageManager).toBe('npm');
    expect(scan.detection.database).toBe('Supabase Postgres');
    expect(scan.detection.auth).toBe('Supabase Auth');
    expect(scan.detection.deployment).toBe('Vercel');
    expect(scan.fileCount).toBeGreaterThan(0);
    expect(scan.summary).toContain('Next.js');

    const after = projectsService.byId(project.id)!;
    expect(after.lastScannedAt).not.toBeNull();
    expect(after.primaryStack).toBe('Next.js + React');

    const files = scansRepo.filesByScan(scan.id);
    const paths = files.map((f) => f.path);
    expect(paths).toContain('package.json');
    expect(paths).toContain('app/page.tsx');
    expect(paths).not.toContain('.env');
    expect(files.find((f) => f.path === 'package.json')!.fileType).toBe('config');
    expect(files.find((f) => f.path === 'app/page.tsx')!.fileType).toBe('source');

    const env = scansRepo.envVarsByScan(scan.id);
    expect(env.find((v) => v.variable === 'NEXT_PUBLIC_API')?.required).toBe(false);
    expect(env.find((v) => v.variable === 'DATABASE_URL')?.required).toBe(true);

    expect(scan.warnings.some((w) => w.code === 'SECRET_FILE_PRESENT')).toBe(true);

    handle.close();
  });
});
