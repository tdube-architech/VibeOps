import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openDb } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { projects } from '@main/db/schema';
import { eq } from 'drizzle-orm';

let tmpDir: string;
let dbFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibeops-db-'));
  dbFile = path.join(tmpDir, 'test.db');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDb + migrations', () => {
  it('creates projects table after migration', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    const tables = h.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
    h.close();
  });

  it('inserts and reads a project row', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    h.db.insert(projects).values({
      id: 'p1',
      name: 'Test',
      slug: 'test',
      localPath: 'C:\\\\tmp\\\\test'
    }).run();
    const found = h.db.select().from(projects).where(eq(projects.id, 'p1')).all();
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('Test');
    h.close();
  });

  it('allows duplicate localPath (UNIQUE dropped in 0007 for local+cloud-stub pairing)', () => {
    const h = openDb(dbFile);
    runMigrations(h, path.resolve(process.cwd(), 'drizzle'));
    const row = { id: 'p1', name: 'A', slug: 'a', localPath: 'C:\\\\tmp\\\\dup' };
    h.db.insert(projects).values(row).run();
    h.db.insert(projects).values({ ...row, id: 'p2' }).run();
    const rows = h.db.select().from(projects).where(eq(projects.localPath, 'C:\\\\tmp\\\\dup')).all();
    expect(rows).toHaveLength(2);
    h.close();
  });
});
