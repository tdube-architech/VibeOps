import Database, { type Database as BetterSqliteDb } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  raw: BetterSqliteDb;
  db: Db;
  close: () => void;
}

export function openDb(filePath: string): DbHandle {
  const raw = new Database(filePath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  const db = drizzle(raw, { schema });
  return {
    raw,
    db,
    close: () => raw.close()
  };
}
