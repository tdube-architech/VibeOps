import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { RulePack, RulePackUpdateInfo, RulePackUpdateResult } from '@shared/rule-pack';
import { RULE_PACK_PUBLIC_KEY_B64, RULE_PACK_UPDATE_URL } from './pubkey';
import { verifyRulePackSignature } from './verify';
import { loadActiveRulePack } from './loader';

export type UpdateResult = RulePackUpdateResult;

export interface UpdaterDeps {
  appDataRoot: string;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

const REMOTE_FILE = 'active.json';
const STATE_FILE = 'last-check.json';
const FETCH_TIMEOUT_MS = 15_000;

interface PersistedState {
  lastCheckedAt: string | null;
  lastVersion: string | null;
  lastError: string | null;
}

function rulePackDir(appDataRoot: string): string {
  return path.join(appDataRoot, 'rule-packs');
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readState(appDataRoot: string): PersistedState {
  const file = path.join(rulePackDir(appDataRoot), STATE_FILE);
  if (!fs.existsSync(file)) {
    return { lastCheckedAt: null, lastVersion: null, lastError: null };
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PersistedState;
  } catch {
    return { lastCheckedAt: null, lastVersion: null, lastError: null };
  }
}

function writeState(appDataRoot: string, state: PersistedState): void {
  const dir = rulePackDir(appDataRoot);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, STATE_FILE), JSON.stringify(state, null, 2), 'utf8');
}

function compareVersions(current: string | null, latest: string): number {
  if (!current) return -1;
  const a = current.split('.').map(Number);
  const b = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

async function fetchWithTimeout(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function checkForRulePackUpdate(deps: UpdaterDeps): Promise<UpdateResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const logger = deps.logger;
  const dir = rulePackDir(deps.appDataRoot);
  ensureDir(dir);

  if (!RULE_PACK_PUBLIC_KEY_B64) {
    logger.warn('rule pack updates disabled — RULE_PACK_PUBLIC_KEY_B64 is empty');
    return {
      status: 'disabled',
      currentVersion: null,
      latestVersion: null,
      message: 'Rule pack updates disabled (no public key embedded).',
      errorCode: 'no-pubkey'
    };
  }

  if (!RULE_PACK_UPDATE_URL || RULE_PACK_UPDATE_URL.includes('REPLACE_OWNER')) {
    return {
      status: 'disabled',
      currentVersion: null,
      latestVersion: null,
      message: 'Rule pack update URL is not configured.',
      errorCode: 'no-pubkey'
    };
  }

  const current = loadActiveRulePack({ appDataRoot: deps.appDataRoot, logger });
  const currentVersion = current?.manifest.packVersion ?? null;

  let manifestRes: Response;
  try {
    manifestRes = await fetchWithTimeout(RULE_PACK_UPDATE_URL, fetchImpl, FETCH_TIMEOUT_MS);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn({ err: message }, 'rule-pack manifest fetch failed');
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: null, message, errorCode: 'fetch-failed' };
  }

  if (!manifestRes.ok) {
    const message = `manifest HTTP ${manifestRes.status}`;
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: null, message, errorCode: 'fetch-failed' };
  }

  let info: RulePackUpdateInfo;
  try {
    info = (await manifestRes.json()) as RulePackUpdateInfo;
  } catch (e) {
    const message = `manifest parse failed: ${(e as Error).message}`;
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: null, message, errorCode: 'manifest-invalid' };
  }

  if (!info.url || !info.sha256 || !info.signature || !info.packVersion) {
    const message = 'manifest missing required fields';
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: null, message, errorCode: 'manifest-invalid' };
  }

  if (compareVersions(currentVersion, info.packVersion) >= 0) {
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: null });
    return {
      status: 'up-to-date',
      currentVersion,
      latestVersion: info.packVersion,
      message: `Rule pack ${currentVersion} is current.`
    };
  }

  let packBody: string;
  try {
    const res = await fetchWithTimeout(info.url, fetchImpl, FETCH_TIMEOUT_MS * 2);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    packBody = await res.text();
  } catch (e) {
    const message = `pack download failed: ${(e as Error).message}`;
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: info.packVersion, message, errorCode: 'fetch-failed' };
  }

  const actualSha = sha256Hex(packBody);
  if (actualSha !== info.sha256) {
    const message = `sha256 mismatch: expected ${info.sha256.slice(0, 12)}, got ${actualSha.slice(0, 12)}`;
    logger.error(message);
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: info.packVersion, message, errorCode: 'sha-mismatch' };
  }

  let pack: RulePack;
  try {
    pack = JSON.parse(packBody) as RulePack;
  } catch (e) {
    const message = `pack parse failed: ${(e as Error).message}`;
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: info.packVersion, message, errorCode: 'parse-failed' };
  }

  if (!verifyRulePackSignature(pack, RULE_PACK_PUBLIC_KEY_B64)) {
    const message = 'signature verification failed — pack rejected';
    logger.error({ packVersion: info.packVersion }, message);
    writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: currentVersion, lastError: message });
    return { status: 'error', currentVersion, latestVersion: info.packVersion, message, errorCode: 'sig-invalid' };
  }

  try {
    ensureDir(dir);
    const tmp = path.join(dir, `${REMOTE_FILE}.tmp`);
    fs.writeFileSync(tmp, packBody, 'utf8');
    fs.renameSync(tmp, path.join(dir, REMOTE_FILE));
  } catch (e) {
    const message = `pack write failed: ${(e as Error).message}`;
    return { status: 'error', currentVersion, latestVersion: info.packVersion, message, errorCode: 'write-failed' };
  }

  logger.info({ packVersion: info.packVersion, ruleCount: pack.manifest.ruleCount }, 'rule pack updated');
  writeState(deps.appDataRoot, { lastCheckedAt: new Date().toISOString(), lastVersion: info.packVersion, lastError: null });

  return {
    status: 'updated',
    currentVersion,
    latestVersion: info.packVersion,
    message: `Updated to rule pack ${info.packVersion} (${pack.manifest.ruleCount} rules).`
  };
}

export interface SchedulerDeps extends UpdaterDeps {
  intervalMs?: number;
  startupDelayMs?: number;
  onResult?: (result: UpdateResult) => void;
}

export function startRulePackUpdateScheduler(deps: SchedulerDeps): () => void {
  const intervalMs = deps.intervalMs ?? 24 * 60 * 60 * 1000;
  const startupDelayMs = deps.startupDelayMs ?? 30_000;

  const tick = async (): Promise<void> => {
    try {
      const result = await checkForRulePackUpdate(deps);
      deps.onResult?.(result);
    } catch (e) {
      deps.logger.warn({ err: (e as Error).message }, 'rule pack scheduler tick failed');
    }
  };

  const startTimer = setTimeout(() => { void tick(); }, startupDelayMs);
  const intervalTimer = setInterval(() => { void tick(); }, intervalMs);

  return () => {
    clearTimeout(startTimer);
    clearInterval(intervalTimer);
  };
}

export function readUpdaterState(appDataRoot: string): PersistedState {
  return readState(appDataRoot);
}
