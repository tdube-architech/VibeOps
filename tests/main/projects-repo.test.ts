import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { openDb, type DbHandle } from '@main/db/client';
import { runMigrations } from '@main/db/migrate';
import { ProjectsRepo } from '@main/projects/repo';

let tmp: string;
let dbFile: string;
let handle: DbHandle;
let repo: ProjectsRepo;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-repo-'));
  dbFile = path.join(tmp, 'r.db');
  handle = openDb(dbFile);
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  repo = new ProjectsRepo(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('ProjectsRepo', () => {
  it('inserts and retrieves a project', () => {
    const created = repo.insert({
      id: 'p1', name: 'Alpha', slug: 'alpha', localPath: 'C:/projects/alpha'
    });
    expect(created.id).toBe('p1');
    const fetched = repo.byId('p1');
    expect(fetched?.name).toBe('Alpha');
    expect(fetched?.tags).toEqual([]);
  });

  it('lists projects ordered by createdAt desc by default', () => {
    repo.insert({ id: 'a', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: 'b', name: 'B', slug: 'b', localPath: 'C:/b' });
    const list = repo.list({});
    expect(list.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('filters by search across name + path', () => {
    repo.insert({ id: '1', name: 'My App', slug: 'my-app', localPath: 'C:/apps/my-app' });
    repo.insert({ id: '2', name: 'Other', slug: 'other', localPath: 'C:/x/other' });
    expect(repo.list({ search: 'my' }).map((p) => p.id)).toEqual(['1']);
    expect(repo.list({ search: 'apps' }).map((p) => p.id)).toEqual(['1']);
  });

  it('excludes archived by default but includes when asked', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: '2', name: 'Z', slug: 'z', localPath: 'C:/z', status: 'archived' });
    expect(repo.list({}).map((p) => p.id)).toEqual(['1']);
    expect(repo.list({ includeArchived: true }).map((p) => p.id).sort()).toEqual(['1', '2']);
  });

  it('byPath finds by exact local_path', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/Apps/A' });
    expect(repo.byPath('C:/Apps/A')?.id).toBe('1');
    expect(repo.byPath('C:/apps/a')).toBeNull();
  });

  it('takenSlugs returns set of slugs', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.insert({ id: '2', name: 'B', slug: 'b', localPath: 'C:/b' });
    const slugs = repo.takenSlugs();
    expect(slugs.has('a')).toBe(true);
    expect(slugs.has('b')).toBe(true);
    expect(slugs.size).toBe(2);
  });

  it('update modifies fields and bumps updated_at', async () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    const before = repo.byId('1')!;
    await new Promise((r) => setTimeout(r, 1100));
    repo.update({ id: '1', name: 'A2', tags: ['x', 'y'] });
    const after = repo.byId('1')!;
    expect(after.name).toBe('A2');
    expect(after.tags).toEqual(['x', 'y']);
    expect(after.updatedAt > before.updatedAt).toBe(true);
  });

  it('archive sets status without deleting row', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.archive('1');
    expect(repo.byId('1')?.status).toBe('archived');
  });

  it('remove deletes the row', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/a' });
    repo.remove('1');
    expect(repo.byId('1')).toBeNull();
  });

  it('allows duplicate localPath (UNIQUE dropped in 0007 for local+cloud-stub pairing)', () => {
    repo.insert({ id: '1', name: 'A', slug: 'a', localPath: 'C:/dup' });
    repo.insert({ id: '2', name: 'B', slug: 'b', localPath: 'C:/dup' });
    expect(repo.byPath('C:/dup')).toBeDefined();
  });
});
