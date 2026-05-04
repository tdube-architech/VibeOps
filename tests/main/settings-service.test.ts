import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SettingsService } from '@main/settings/service';
import type { SecretStore } from '@main/settings/safe-storage';

const fakeStore: SecretStore = {
  isAvailable: () => false,
  encryptToBase64: (s) => `unsafe:${Buffer.from(s).toString('base64')}`,
  decryptFromBase64: (b) => Buffer.from(b.replace('unsafe:', ''), 'base64').toString()
};

let tmp: string;
let settingsPath: string;
let secretsPath: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-settings-'));
  settingsPath = path.join(tmp, 'settings.json');
  secretsPath = path.join(tmp, 'secrets.json');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('SettingsService', () => {
  it('returns defaults on first read', () => {
    const svc = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore });
    const s = svc.read();
    expect(s.schemaVersion).toBe(1);
    expect(s.ai.activeProviderId).toBeNull();
    expect(s.ai.providers.anthropic.enabled).toBe(false);
  });
  it('writes a partial update and persists', () => {
    const svc = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore });
    svc.update({ ai: { activeProviderId: 'anthropic', providers: { anthropic: { enabled: true } } as never } });
    const reloaded = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore }).read();
    expect(reloaded.ai.activeProviderId).toBe('anthropic');
    expect(reloaded.ai.providers.anthropic.enabled).toBe(true);
    expect(reloaded.ai.providers.anthropic.defaultModel).toBe('claude-sonnet-4-6');
  });
  it('stores api key encrypted (or base64-fallback) and never in settings.json', () => {
    const svc = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore });
    svc.setApiKey('anthropic', 'sk-ant-test-12345');
    const settingsRaw = fs.readFileSync(settingsPath, 'utf8');
    expect(settingsRaw).not.toContain('sk-ant-test-12345');
    expect(svc.getApiKey('anthropic')).toBe('sk-ant-test-12345');
    expect(svc.read().ai.providers.anthropic.apiKeyPresent).toBe(true);
  });
  it('clearApiKey removes the secret and flips apiKeyPresent', () => {
    const svc = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore });
    svc.setApiKey('anthropic', 'sk-x');
    svc.clearApiKey('anthropic');
    expect(svc.getApiKey('anthropic')).toBeNull();
    expect(svc.read().ai.providers.anthropic.apiKeyPresent).toBe(false);
  });
  it('survives malformed settings.json by falling back to defaults', () => {
    fs.writeFileSync(settingsPath, '{ this is not json');
    const svc = new SettingsService({ settingsPath, secretsPath, secretStore: fakeStore });
    expect(svc.read().schemaVersion).toBe(1);
  });
});
