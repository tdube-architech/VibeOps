import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, type DbHandle } from './client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function runMigrations(handle: DbHandle, migrationsFolder?: string): void {
  const folder = migrationsFolder ?? path.resolve(__dirname, '../../drizzle');
  migrate(handle.db, { migrationsFolder: folder });
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const file = process.env.VIBEOPS_DB ?? path.join(process.cwd(), '.dev.db');
  const handle = openDb(file);
  runMigrations(handle, path.resolve(process.cwd(), 'drizzle'));
  handle.close();
  console.log(`Migrated ${file}`);
}
