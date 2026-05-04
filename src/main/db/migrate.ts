import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { openDb, type DbHandle } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveMigrationsFolder(): string {
  // Packaged: extraResources places drizzle/ at process.resourcesPath
  try {
    const requireFn = createRequire(import.meta.url);
    const electron = requireFn('electron') as typeof import('electron');
    if (electron?.app?.isPackaged && process.resourcesPath) {
      const packaged = path.join(process.resourcesPath, 'drizzle');
      if (fs.existsSync(packaged)) return packaged;
    }
  } catch {
    // not in electron context (tests, scripts)
  }
  return path.resolve(__dirname, '../../drizzle');
}

export function runMigrations(handle: DbHandle, migrationsFolder?: string): void {
  const folder = migrationsFolder ?? resolveMigrationsFolder();
  migrate(handle.db, { migrationsFolder: folder });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const file = process.env.VIBEOPS_DB ?? path.join(process.cwd(), '.dev.db');
  const handle = openDb(file);
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  handle.close();
  console.log(`Migrated ${file}`);
}
