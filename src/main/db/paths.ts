import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface AppPaths {
  root: string;
  dbFile: string;
  logsDir: string;
  backupsDir: string;
  indexesDir: string;
  settingsFile: string;
}

export function resolveAppPaths(overrideRoot?: string): AppPaths {
  const root = overrideRoot ?? path.join(app.getPath('appData'), 'VibeOps');
  const paths: AppPaths = {
    root,
    dbFile: path.join(root, 'vibeops.db'),
    logsDir: path.join(root, 'logs'),
    backupsDir: path.join(root, 'backups'),
    indexesDir: path.join(root, 'indexes'),
    settingsFile: path.join(root, 'settings.json')
  };
  for (const dir of [paths.root, paths.logsDir, paths.backupsDir, paths.indexesDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
