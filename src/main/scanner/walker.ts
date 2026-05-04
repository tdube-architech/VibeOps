import fg from 'fast-glob';
import fs from 'node:fs';
import path from 'node:path';
import type { ScanWarning } from '@shared/types';
import { buildIgnore, isSecretFilename } from './ignore-rules';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface WalkedFile {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  isSymbolicLink: boolean;
  skippedReason: 'TOO_LARGE' | null;
}

export interface WalkResult {
  files: WalkedFile[];
  warnings: ScanWarning[];
  totalFiles: number;
  totalBytes: number;
}

export interface WalkOptions {
  extraIgnore?: string[];
  signal?: AbortSignal;
}

export async function walkProject(rootDir: string, opts: WalkOptions = {}): Promise<WalkResult> {
  const root = path.resolve(rootDir);
  const ig = buildIgnore(root, opts.extraIgnore ?? []);
  const warnings: ScanWarning[] = [];

  const entries = await fg(['**/*'], {
    cwd: root,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    suppressErrors: true,
    stats: true
  });

  let totalBytes = 0;
  const files: WalkedFile[] = [];

  for (const entry of entries) {
    if (opts.signal?.aborted) throw new Error('SCAN_CANCELED');
    const stats = entry.stats!;
    const rel = entry.path.replace(/\\/g, '/');
    if (stats.isDirectory()) continue;
    if (ig.ignores(rel)) {
      if (isSecretFilename(rel)) {
        warnings.push({
          code: 'SECRET_FILE_PRESENT',
          message: `Found secret-like file: ${rel} (contents not read)`,
          filePath: rel
        });
      }
      continue;
    }
    if (stats.isSymbolicLink()) {
      warnings.push({
        code: 'SYMLINK_SKIPPED',
        message: `Symlink not followed: ${rel}`,
        filePath: rel
      });
      continue;
    }
    const sizeBytes = stats.size ?? 0;
    const skippedReason = sizeBytes > MAX_FILE_BYTES ? 'TOO_LARGE' : null;
    if (skippedReason) {
      warnings.push({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds ${MAX_FILE_BYTES} bytes — metadata only: ${rel}`,
        filePath: rel
      });
    }
    totalBytes += sizeBytes;
    files.push({
      relativePath: rel,
      absolutePath: path.join(root, rel),
      sizeBytes,
      isSymbolicLink: false,
      skippedReason
    });
  }

  return { files, warnings, totalFiles: files.length, totalBytes };
}

export function safeReadText(absPath: string, maxBytes = 256 * 1024): string | null {
  try {
    const stats = fs.statSync(absPath);
    if (stats.size > maxBytes) return null;
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return null;
  }
}
