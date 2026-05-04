import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { MemoryFileStatus } from '@shared/types';

const FILE_NAME = 'memory.md';

function memoryPath(projectRoot: string): string {
  return path.join(projectRoot, FILE_NAME);
}

function backupPathFor(filePath: string, when: Date): string {
  const stamp = when.toISOString().replace(/[:.]/g, '-');
  return `${filePath}.${stamp}.bak`;
}

export interface WriteResult {
  filePath: string;
  backupPath: string | null;
}

export async function writeMemoryFile(projectRoot: string, content: string): Promise<WriteResult> {
  const stat = await fs.stat(projectRoot).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error(`Project directory does not exist: ${projectRoot}`);

  const filePath = memoryPath(projectRoot);
  let backupPath: string | null = null;

  try {
    await fs.access(filePath);
    backupPath = backupPathFor(filePath, new Date());
    await fs.copyFile(filePath, backupPath);
  } catch {
    // file did not exist; no backup needed
  }

  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
  return { filePath, backupPath };
}

export function readMemoryFile(projectRoot: string): string | null {
  const filePath = memoryPath(projectRoot);
  try {
    return fsSync.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function statMemoryFile(projectRoot: string): MemoryFileStatus {
  const filePath = memoryPath(projectRoot);
  try {
    const s = fsSync.statSync(filePath);
    return { exists: true, filePath, sizeBytes: s.size, modifiedAt: s.mtime.toISOString() };
  } catch {
    return { exists: false, filePath, sizeBytes: null, modifiedAt: null };
  }
}
