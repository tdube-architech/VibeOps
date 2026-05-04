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
import { MemoriesRepo } from '@main/memory/repo';
import { MemoryService } from '@main/memory/service';
import { ChatRepo } from '@main/chat/repo';
import { ChatService } from '@main/chat/service';
import { SettingsService } from '@main/settings/service';
import { ProviderRegistry } from '@main/ai/registry';
import { customAlphabet } from 'nanoid';

const logger = pino({ level: 'silent' });
const fakeStore = {
  isAvailable: () => false,
  encryptToBase64: (s: string) => `unsafe:${Buffer.from(s).toString('base64')}`,
  decryptFromBase64: (b: string) => Buffer.from(b.replace('unsafe:', ''), 'base64').toString()
};

let workdir: string;
let projectDir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-chat-'));
  projectDir = path.join(workdir, 'app');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'package.json'),
    JSON.stringify({ name: 'demo', dependencies: { next: '14', react: '18' } }));
});
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('ChatService', () => {
  it('ensures a session and exchanges a message via mock provider', async () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const projectsRepo = new ProjectsRepo(handle.db);
    const projectsService = new ProjectsService(projectsRepo);
    const scansRepo = new ScansRepo(handle.db);
    const memoriesRepo = new MemoriesRepo(handle.db);
    const id = customAlphabet('abcdef0123456789', 12);
    const memoryService = new MemoryService({ memoriesRepo, projectsService, scansRepo, newId: () => `m_${id()}` });
    const chatRepo = new ChatRepo(handle.db);
    const settings = new SettingsService({
      settingsPath: path.join(workdir, 'settings.json'),
      secretsPath: path.join(workdir, 'secrets.json'),
      secretStore: fakeStore
    });
    settings.update({ ai: { ...settings.read().ai, activeProviderId: 'mock' } });
    const registry = new ProviderRegistry(settings);

    const project = projectsService.add({ name: 'Demo', localPath: projectDir });
    await runScan({ scansRepo, projectsService, logger }, { projectId: project.id, emitter: null });

    const svc = new ChatService({ chatRepo, registry, projectsService, scansRepo, memoryService, logger });
    const session = svc.ensureProjectSession(project.id);
    const { user, assistant } = await svc.send({ sessionId: session.id, userText: 'What does this app do?' });
    expect(user.role).toBe('user');
    expect(assistant.role).toBe('assistant');
    expect(assistant.content.length).toBeGreaterThan(0);
    const history = svc.history(session.id);
    expect(history).toHaveLength(2);
    handle.close();
  });
});
