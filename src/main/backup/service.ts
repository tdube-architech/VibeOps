import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export interface BackupServiceDeps {
  dbFile: string;
}

export interface BackupResult {
  destination: string;
  bytesCopied: number;
}

const SQLITE_HEADER = Buffer.from('SQLite format 3 ', 'ascii');

export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  async exportDb(destination: string): Promise<BackupResult> {
    const dir = path.dirname(destination);
    await fs.mkdir(dir, { recursive: true });
    const stats = await fs.stat(this.deps.dbFile);
    await fs.copyFile(this.deps.dbFile, destination);
    return { destination, bytesCopied: stats.size };
  }

  async importDb(source: string): Promise<BackupResult> {
    const stats = await fs.stat(source);
    if (stats.size < SQLITE_HEADER.length) {
      throw new Error('Source file is too small to be a SQLite database.');
    }
    const fh = await fs.open(source, 'r');
    try {
      const buf = Buffer.alloc(SQLITE_HEADER.length);
      await fh.read(buf, 0, SQLITE_HEADER.length, 0);
      if (!buf.equals(SQLITE_HEADER)) {
        throw new Error('File is not a SQLite database (header mismatch).');
      }
    } finally {
      await fh.close();
    }
    const backup = `${this.deps.dbFile}.before-import.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
    if (fsSync.existsSync(this.deps.dbFile)) {
      await fs.copyFile(this.deps.dbFile, backup);
    }
    await fs.copyFile(source, this.deps.dbFile);
    return { destination: this.deps.dbFile, bytesCopied: stats.size };
  }
}
