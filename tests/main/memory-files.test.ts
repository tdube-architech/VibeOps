import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { writeMemoryFile, readMemoryFile, statMemoryFile } from '@main/memory/files';

let tmp: string;

beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-mem-')); });
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('writeMemoryFile', () => {
  it('writes new memory.md when none exists, no backup created', async () => {
    const r = await writeMemoryFile(tmp, '# hello');
    expect(r.filePath).toBe(path.join(tmp, 'memory.md'));
    expect(r.backupPath).toBeNull();
    expect(fs.readFileSync(r.filePath, 'utf8')).toBe('# hello');
  });
  it('creates a timestamped backup when overwriting', async () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), '# old');
    const r = await writeMemoryFile(tmp, '# new');
    expect(r.backupPath).not.toBeNull();
    expect(fs.readFileSync(r.backupPath!, 'utf8')).toBe('# old');
    expect(fs.readFileSync(r.filePath, 'utf8')).toBe('# new');
  });
  it('rejects writes outside the project root', async () => {
    await expect(writeMemoryFile('/totally/fake/path', '# x')).rejects.toThrow(/exist|directory/i);
  });
});

describe('readMemoryFile', () => {
  it('returns null when not present', () => {
    expect(readMemoryFile(tmp)).toBeNull();
  });
  it('returns content when present', () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), 'hi');
    expect(readMemoryFile(tmp)).toBe('hi');
  });
});

describe('statMemoryFile', () => {
  it('reports exists=false initially', () => {
    const s = statMemoryFile(tmp);
    expect(s.exists).toBe(false);
    expect(s.sizeBytes).toBeNull();
  });
  it('reports stats when present', () => {
    fs.writeFileSync(path.join(tmp, 'memory.md'), 'abc');
    const s = statMemoryFile(tmp);
    expect(s.exists).toBe(true);
    expect(s.sizeBytes).toBe(3);
    expect(s.modifiedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
