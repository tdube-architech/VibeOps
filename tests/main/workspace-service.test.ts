import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { WorkspacesRepo } from '@main/workspaces/repo';
import { WorkspacesService } from '@main/workspaces/service';

let workdir: string;

beforeEach(() => { workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-ws-')); });
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('WorkspacesService', () => {
  it('default workspace created by migration', () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const repo = new WorkspacesRepo(handle.db);
    const list = repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('ws_local');
    handle.close();
  });

  it('creates and lists additional workspaces', () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const svc = new WorkspacesService(new WorkspacesRepo(handle.db));
    const w = svc.create({ name: 'Acme Client' });
    expect(w.slug).toBe('acme-client');
    const list = svc.list();
    expect(list.map((x) => x.id)).toContain(w.id);
    handle.close();
  });

  it('rename updates name and slug stays unique', () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const svc = new WorkspacesService(new WorkspacesRepo(handle.db));
    const a = svc.create({ name: 'Foo' });
    const b = svc.create({ name: 'Foo' });
    expect(a.slug).toBe('foo');
    expect(b.slug).toBe('foo-2');
    const renamed = svc.rename(a.id, 'Bar');
    expect(renamed.name).toBe('Bar');
    handle.close();
  });

  it('cannot delete ws_local (default)', () => {
    const handle = openDb(path.join(workdir, 'db.sqlite'));
    runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
    const svc = new WorkspacesService(new WorkspacesRepo(handle.db));
    expect(() => svc.remove('ws_local')).toThrow(/default/i);
    handle.close();
  });
});
