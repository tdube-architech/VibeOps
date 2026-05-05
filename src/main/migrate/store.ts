import fs from 'node:fs';
import path from 'node:path';

const FILE = 'migration.json';

export interface MigrationMap {
  /** ISO timestamp at which user last clicked "Skip for now". null = never skipped */
  skippedAt: string | null;
  /** localId → serverUuid mapping for already-migrated projects */
  mappings: Record<string, string>;
}

function filePath(appDataRoot: string): string {
  return path.join(appDataRoot, FILE);
}

export function readMigrationMap(appDataRoot: string): MigrationMap {
  const file = filePath(appDataRoot);
  if (!fs.existsSync(file)) return { skippedAt: null, mappings: {} };
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as MigrationMap;
  } catch {
    return { skippedAt: null, mappings: {} };
  }
}

export function writeMigrationMap(appDataRoot: string, map: MigrationMap): void {
  const file = filePath(appDataRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(map, null, 2), 'utf8');
}

export function recordMigration(appDataRoot: string, localId: string, serverId: string): void {
  const map = readMigrationMap(appDataRoot);
  map.mappings[localId] = serverId;
  writeMigrationMap(appDataRoot, map);
}

export function recordSkip(appDataRoot: string): void {
  const map = readMigrationMap(appDataRoot);
  map.skippedAt = new Date().toISOString();
  writeMigrationMap(appDataRoot, map);
}
