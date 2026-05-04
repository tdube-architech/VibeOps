import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, AIProviderId, AIProviderConfig } from '@shared/types';
import { migrateSettings, mergeDeep, DEFAULT_SETTINGS } from './schema';
import type { SecretStore } from './safe-storage';

export interface SettingsServiceDeps {
  settingsPath: string;
  secretsPath: string;
  secretStore: SecretStore;
}

interface SecretsFile {
  apiKeys?: Partial<Record<AIProviderId, string>>;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

export class SettingsService {
  constructor(private readonly deps: SettingsServiceDeps) {}

  read(): AppSettings {
    const raw = readJson<unknown>(this.deps.settingsPath) ?? null;
    return migrateSettings(raw);
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const current = this.read();
    const merged = mergeDeep(current, patch);
    writeJsonAtomic(this.deps.settingsPath, merged);
    return merged;
  }

  setProviderConfig(id: AIProviderId, partial: Partial<AIProviderConfig>): AppSettings {
    const current = this.read();
    const provider = { ...current.ai.providers[id], ...partial };
    return this.update({ ai: { ...current.ai, providers: { ...current.ai.providers, [id]: provider } } });
  }

  setApiKey(id: AIProviderId, key: string): void {
    const secrets = readJson<SecretsFile>(this.deps.secretsPath) ?? {};
    const apiKeys = secrets.apiKeys ?? {};
    apiKeys[id] = this.deps.secretStore.encryptToBase64(key);
    writeJsonAtomic(this.deps.secretsPath, { ...secrets, apiKeys });
    this.setProviderConfig(id, { apiKeyPresent: true });
  }

  getApiKey(id: AIProviderId): string | null {
    const secrets = readJson<SecretsFile>(this.deps.secretsPath);
    const stored = secrets?.apiKeys?.[id];
    if (!stored) return null;
    try {
      return this.deps.secretStore.decryptFromBase64(stored);
    } catch {
      return null;
    }
  }

  clearApiKey(id: AIProviderId): void {
    const secrets = readJson<SecretsFile>(this.deps.secretsPath) ?? {};
    if (secrets.apiKeys) delete secrets.apiKeys[id];
    writeJsonAtomic(this.deps.secretsPath, secrets);
    this.setProviderConfig(id, { apiKeyPresent: false });
  }
}

export { DEFAULT_SETTINGS };
