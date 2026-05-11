import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import pino from 'pino';

// Audit loader (src/main/audit/rule-pack/loader.ts) imports electron.app to compute
// the bundled rule-pack path. Outside the Electron runtime `app` is undefined, so we
// stub it here. The test does not place a rule pack in workdir, so the loader will
// fall through to bundledPath() and find no file — audit proceeds without rule-pack findings.
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd()
  }
}));
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';
import { ProjectsService } from '@main/projects/service';
import { ScansRepo } from '@main/scanner/repo';
import { runScan } from '@main/scanner';
import { AuditsRepo } from '@main/audit/repo';
import { runAudit } from '@main/audit';
import { ProviderRegistry } from '@main/ai/registry';
import { SettingsService } from '@main/settings/service';
import type { SecretStore } from '@main/settings/safe-storage';

const logger = pino({ level: 'silent' });
const fakeStore: SecretStore = {
  isAvailable: () => false,
  encryptToBase64: (s) => `unsafe:${Buffer.from(s).toString('base64')}`,
  decryptFromBase64: (b) => Buffer.from(b.replace('unsafe:', ''), 'base64').toString()
};

let workdir: string;
let projectDir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-aud-e2e-'));
  projectDir = path.join(workdir, 'app');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({
      name: 'demo',
      dependencies: { next: '14', react: '18', '@supabase/supabase-js': '^2' },
      devDependencies: { tailwindcss: '^3' }
    })
  );
  fs.writeFileSync(path.join(projectDir, 'next.config.js'), 'module.exports = {}');
  fs.writeFileSync(path.join(projectDir, '.env.example'), 'SUPABASE_SERVICE_ROLE_KEY=x\n');
  fs.mkdirSync(path.join(projectDir, 'app'));
  fs.writeFileSync(
    path.join(projectDir, 'app/page.tsx'),
    'const c = "sk-ant-aaaaaaaaaaaaaaaaaaaaaa"; export default function P() { return null; }'
  );
  fs.mkdirSync(path.join(projectDir, 'pages'));
  fs.writeFileSync(path.join(projectDir, 'pages/api.ts'), 'export {}');
});
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('runAudit end-to-end', () => {
  it('produces findings, score, prompt without AI provider', async () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);
    const auditsRepo = new AuditsRepo(handle.db);
    const settings = new SettingsService({
      settingsPath: path.join(workdir, 'settings.json'),
      secretsPath: path.join(workdir, 'secrets.json'),
      secretStore: fakeStore
    });
    const registry = new ProviderRegistry(settings);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });
    await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });

    const audit = await runAudit(
      { auditsRepo, scansRepo, projectsService, registry, logger, appDataRoot: workdir },
      { projectId: project.id }
    );

    expect(audit.status).toBe('completed');
    expect(audit.score).not.toBeNull();
    expect(audit.findings.length).toBeGreaterThan(0);
    expect(audit.findings.some((f) => f.severity === 'critical' && f.title.toLowerCase().includes('hardcoded'))).toBe(true);
    expect(audit.findings.some((f) => f.title.includes('mixes /app and /pages'))).toBe(true);
    expect(audit.generatedPromptId).not.toBeNull();
    expect(audit.summary).toMatch(/score \d+\/100/);

    handle.close();
  });

  it('uses mock provider when active and adds AI findings', async () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);
    const auditsRepo = new AuditsRepo(handle.db);
    const settings = new SettingsService({
      settingsPath: path.join(workdir, 'settings.json'),
      secretsPath: path.join(workdir, 'secrets.json'),
      secretStore: fakeStore
    });
    settings.update({ ai: { ...settings.read().ai, activeProviderId: 'mock' } });
    const registry = new ProviderRegistry(settings);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });
    await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });

    const audit = await runAudit(
      { auditsRepo, scansRepo, projectsService, registry, logger, appDataRoot: workdir },
      { projectId: project.id }
    );

    expect(audit.provider).toBe('mock');
    expect(audit.findings.some((f) => f.category === 'product-completeness')).toBe(true);
    expect(audit.recommendedNextAction).not.toBeNull();
    handle.close();
  });
});
