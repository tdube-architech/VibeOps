import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import type { Logger } from 'pino';
import type { RulePack, RulePackManifest } from '@shared/rule-pack';

const BUNDLED_FILENAME = 'builtin.json';
const REMOTE_FILENAME = 'active.json';

export interface LoadOptions {
  appDataRoot: string;
  logger: Logger;
}

function bundledPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'rule-packs', BUNDLED_FILENAME);
  }
  return path.join(app.getAppPath(), 'resources', 'rule-packs', BUNDLED_FILENAME);
}

function remotePath(appDataRoot: string): string {
  return path.join(appDataRoot, 'rule-packs', REMOTE_FILENAME);
}

function readPack(filePath: string): RulePack | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as RulePack;
    if (!parsed?.manifest || !Array.isArray(parsed.rules)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function loadActiveRulePack(opts: LoadOptions): RulePack | null {
  const remote = readPack(remotePath(opts.appDataRoot));
  if (remote) {
    opts.logger.info(
      { packId: remote.manifest.packId, packVersion: remote.manifest.packVersion },
      'loaded remote rule pack'
    );
    return remote;
  }
  const bundled = readPack(bundledPath());
  if (bundled) {
    opts.logger.info(
      { packId: bundled.manifest.packId, packVersion: bundled.manifest.packVersion },
      'loaded bundled rule pack'
    );
    return bundled;
  }
  opts.logger.warn({ bundledPath: bundledPath() }, 'no rule pack found; rule audit will be skipped');
  return null;
}

export function rulePackInfo(pack: RulePack | null): RulePackManifest | null {
  return pack?.manifest ?? null;
}
