import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { BackupService } from '@main/backup/service';

let workdir: string;

beforeEach(() => { workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-bk-')); });
afterEach(() => fs.rmSync(workdir, { recursive: true, force: true }));

describe('BackupService.exportDb / importDb', () => {
  it('copies the DB file to a destination', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'SQLITEDATA');
    const dest = path.join(workdir, 'export.db');
    const svc = new BackupService({ dbFile });
    const result = await svc.exportDb(dest);
    expect(result.bytesCopied).toBeGreaterThan(0);
    expect(fs.readFileSync(dest, 'utf8')).toBe('SQLITEDATA');
  });

  it('importDb rejects non-sqlite files based on header check', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'old');
    const bad = path.join(workdir, 'bad.txt');
    fs.writeFileSync(bad, 'not sqlite');
    const svc = new BackupService({ dbFile });
    await expect(svc.importDb(bad)).rejects.toThrow(/sqlite/i);
  });

  it('importDb accepts a valid sqlite header', async () => {
    const dbFile = path.join(workdir, 'vibeops.db');
    fs.writeFileSync(dbFile, 'old');
    const goodSrc = path.join(workdir, 'src.db');
    const header = Buffer.from('SQLite format 3 ', 'ascii');
    fs.writeFileSync(goodSrc, Buffer.concat([header, Buffer.from('rest')]));
    const svc = new BackupService({ dbFile });
    const result = await svc.importDb(goodSrc);
    expect(result.bytesCopied).toBeGreaterThan(0);
    expect(fs.readFileSync(dbFile)).toEqual(fs.readFileSync(goodSrc));
  });
});
