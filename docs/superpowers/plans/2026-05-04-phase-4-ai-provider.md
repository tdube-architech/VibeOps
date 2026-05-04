# VibeOps Phase 4: AI Provider MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pluggable AI provider layer with one working provider (Anthropic), a settings UI for configuration, encrypted local API key storage, a Test Connection button, and a single end-to-end AI operation: `generateProjectSummary(projectId)` that uses scan summaries (not full codebase) and redacts secrets before sending.

**Architecture:** A single `AIProvider` interface lives in `@shared/types` and is implemented by adapters in `src/main/ai/providers/*`. A `ProviderRegistry` in main process picks the active provider from settings. Settings are persisted as JSON in `%APPDATA%/VibeOps/settings.json`. API keys are encrypted at rest using Electron's `safeStorage`. The provider layer never receives raw `.env` content; the redactor strips any text matching common key shapes before the model sees it.

**Tech Stack:** `@anthropic-ai/sdk`. No streaming yet (response shape is JSON for project summary). Settings managed by a small `SettingsService` with strict schema.

**Reference docs:** PRD §8.6, §14, §21.5, §26, §29.4.

**Prerequisites:** Phase 3 plan complete. `phase-3` git tag exists.

---

## File Structure

```
src/
├── main/
│   ├── settings/
│   │   ├── service.ts                          # NEW
│   │   ├── schema.ts                           # NEW
│   │   └── safe-storage.ts                     # NEW — wraps Electron safeStorage
│   ├── ai/
│   │   ├── registry.ts                         # NEW — provider lookup
│   │   ├── redactor.ts                         # NEW — strips secret-shaped tokens
│   │   ├── provider.ts                         # NEW — interface re-export + helpers
│   │   ├── operations/
│   │   │   ├── project-summary.ts              # NEW — high-level op using a provider
│   │   │   └── prompt-templates.ts             # NEW
│   │   └── providers/
│   │       ├── anthropic.ts                    # NEW
│   │       └── mock.ts                         # NEW — for tests
│   └── ipc/
│       ├── handlers.ts                         # MODIFY
│       ├── settings-handlers.ts                # NEW
│       └── ai-handlers.ts                      # NEW
├── shared/
│   ├── ipc-channels.ts                         # MODIFY
│   ├── types.ts                                # MODIFY
│   └── ai.ts                                   # NEW — provider interface + DTOs
├── preload/api.ts                              # MODIFY
└── renderer/
    ├── routes/
    │   └── SettingsRoute.tsx                   # MODIFY — full settings page
    ├── features/
    │   ├── settings/
    │   │   ├── useSettings.ts                  # NEW
    │   │   ├── ProviderForm.tsx                # NEW
    │   │   └── TestConnectionButton.tsx        # NEW
    │   └── projects/
    │       └── ProjectSummaryCard.tsx          # NEW — used in Overview tab
    └── routes/projects/
        └── ProjectOverviewTab.tsx              # MODIFY — wire the summary card

tests/main/
├── ai-redactor.test.ts                         # NEW
├── ai-mock-provider.test.ts                    # NEW
└── settings-service.test.ts                    # NEW
```

---

## Task 1: Shared AI types + provider interface

**Files:**
- Create: `E:\Projects\VibeOps\src\shared\ai.ts`
- Modify: `E:\Projects\VibeOps\src\shared\types.ts`

- [ ] **Step 1: Write `src/shared/ai.ts`**

```ts
export type AIProviderId = 'anthropic' | 'openai' | 'codex' | 'mock';

export type AIModel = string;

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  defaultModel: AIModel;
  models: AIModel[];
  supportsStructuredOutput: boolean;
}

export interface AIProviderConfig {
  id: AIProviderId;
  enabled: boolean;
  apiKeyPresent: boolean;
  defaultModel: AIModel;
  maxTokens: number;
  temperature: number;
  localOnly: boolean;
}

export interface AICallTrace {
  providerId: AIProviderId;
  model: AIModel;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  redactionsApplied: number;
}

export interface ProjectAnalysisInput {
  project: {
    id: string;
    name: string;
    localPath: string;
    description: string | null;
    primaryStack: string | null;
  };
  scanSummary: string | null;
  detection: {
    projectType: string | null;
    frameworks: string[];
    packageManager: string | null;
    database: string | null;
    auth: string | null;
    deployment: string | null;
  };
  topFiles: Array<{ path: string; type: string; importance: number }>;
  envVarNames: string[];
  warnings: Array<{ code: string; message: string }>;
}

export interface ProjectAnalysisResult {
  summary: string;
  keyDirectories: Array<{ path: string; purpose: string }>;
  notableFiles: Array<{ path: string; reason: string }>;
  risks: string[];
  recommendedNextActions: string[];
  trace: AICallTrace;
}

export interface AITestConnectionResult {
  ok: boolean;
  providerId: AIProviderId;
  model: AIModel;
  message: string;
  durationMs: number;
}
```

- [ ] **Step 2: Append to `src/shared/types.ts`**

```ts
import type {
  AIProviderId, AIModel, AIProviderConfig, AICallTrace
} from './ai';
export type { AIProviderId, AIModel, AIProviderConfig, AICallTrace };

export interface AppSettings {
  schemaVersion: 1;
  appearance: { theme: 'dark' | 'light' };
  scanner: { extraIgnore: string[] };
  ai: {
    activeProviderId: AIProviderId | null;
    providers: Record<AIProviderId, AIProviderConfig>;
  };
  externalTools: {
    vsCode: string | null;
    cursor: string | null;
    claudeCode: string | null;
    codex: string | null;
    openCode: string | null;
    windowsTerminal: string | null;
    git: string | null;
  };
  security: {
    shellCommandMode: 'disabled' | 'approval' | 'trusted';
    allowAiCloudCalls: boolean;
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/shared
git commit -m "feat(shared): AI provider interface and AppSettings shape"
```

---

## Task 2: Settings schema + service + safeStorage wrapper

**Files:**
- Create: `E:\Projects\VibeOps\src\main\settings\schema.ts`
- Create: `E:\Projects\VibeOps\src\main\settings\safe-storage.ts`
- Create: `E:\Projects\VibeOps\src\main\settings\service.ts`
- Create: `E:\Projects\VibeOps\tests\main\settings-service.test.ts`

- [ ] **Step 1: Write `src/main/settings/schema.ts`**

```ts
import type { AppSettings } from '@shared/types';

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  appearance: { theme: 'dark' },
  scanner: { extraIgnore: [] },
  ai: {
    activeProviderId: null,
    providers: {
      anthropic: {
        id: 'anthropic', enabled: false, apiKeyPresent: false,
        defaultModel: 'claude-sonnet-4-6', maxTokens: 1500, temperature: 0.2, localOnly: false
      },
      openai: {
        id: 'openai', enabled: false, apiKeyPresent: false,
        defaultModel: 'gpt-4.1-mini', maxTokens: 1500, temperature: 0.2, localOnly: false
      },
      codex: {
        id: 'codex', enabled: false, apiKeyPresent: false,
        defaultModel: 'codex-default', maxTokens: 1500, temperature: 0.2, localOnly: false
      },
      mock: {
        id: 'mock', enabled: false, apiKeyPresent: true,
        defaultModel: 'mock', maxTokens: 1500, temperature: 0.2, localOnly: true
      }
    }
  },
  externalTools: {
    vsCode: null, cursor: null, claudeCode: null, codex: null,
    openCode: null, windowsTerminal: null, git: null
  },
  security: { shellCommandMode: 'disabled', allowAiCloudCalls: true }
};

export function migrateSettings(unknown: unknown): AppSettings {
  const merged = mergeDeep(DEFAULT_SETTINGS, (unknown ?? {}) as Partial<AppSettings>);
  return merged as AppSettings;
}

function mergeDeep<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base)) return (override as unknown as T) ?? base;
  if (typeof base !== 'object' || base === null) return (override as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override ?? {})) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && baseVal && typeof baseVal === 'object') {
      out[k] = mergeDeep(baseVal, v as Partial<typeof baseVal>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}
```

- [ ] **Step 2: Write `src/main/settings/safe-storage.ts`**

```ts
import { safeStorage } from 'electron';

export interface SecretStore {
  encryptToBase64(plaintext: string): string;
  decryptFromBase64(b64: string): string;
  isAvailable(): boolean;
}

export function getSecretStore(): SecretStore {
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptToBase64(plaintext: string): string {
      if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: still base64-encode so settings.json doesn't contain raw key strings.
        return `unsafe:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
      }
      return `safe:${safeStorage.encryptString(plaintext).toString('base64')}`;
    },
    decryptFromBase64(b64: string): string {
      if (b64.startsWith('safe:')) {
        const payload = Buffer.from(b64.slice('safe:'.length), 'base64');
        return safeStorage.decryptString(payload);
      }
      if (b64.startsWith('unsafe:')) {
        return Buffer.from(b64.slice('unsafe:'.length), 'base64').toString('utf8');
      }
      throw new Error('Unknown secret format');
    }
  };
}
```

- [ ] **Step 3: Write the failing test**

`tests/main/settings-service.test.ts`:

```ts
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
    // Default values still present:
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test -- tests/main/settings-service.test.ts`
Expected: FAIL — service missing.

- [ ] **Step 5: Write `src/main/settings/service.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, AIProviderId, AIProviderConfig } from '@shared/types';
import { DEFAULT_SETTINGS, migrateSettings } from './schema';
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

function mergeDeep<T>(base: T, override: Partial<T>): T {
  if (Array.isArray(base)) return (override as unknown as T) ?? base;
  if (typeof base !== 'object' || base === null) return (override as T) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override ?? {})) {
    const baseVal = (base as Record<string, unknown>)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && baseVal && typeof baseVal === 'object') {
      out[k] = mergeDeep(baseVal, v as Partial<typeof baseVal>);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

export { DEFAULT_SETTINGS };
```

- [ ] **Step 6: Run tests**

Run: `pnpm test -- tests/main/settings-service.test.ts`
Expected: 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/main/settings tests/main/settings-service.test.ts
git commit -m "feat(settings): SettingsService with safeStorage-backed API key store"
```

---

## Task 3: Secret redactor

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ai\redactor.ts`
- Create: `E:\Projects\VibeOps\tests\main\ai-redactor.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/main/ai-redactor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { redactSecrets } from '@main/ai/redactor';

describe('redactSecrets', () => {
  it('replaces obvious API keys', () => {
    const r = redactSecrets('Bearer sk-ant-12345abcdef and sk-proj-abc123def456ghi');
    expect(r.text).not.toContain('sk-ant-12345abcdef');
    expect(r.text).not.toContain('sk-proj-abc123def456ghi');
    expect(r.replaced).toBeGreaterThanOrEqual(2);
  });
  it('redacts AWS access key shapes', () => {
    const r = redactSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(r.text).not.toContain('AKIA');
    expect(r.replaced).toBe(1);
  });
  it('redacts Github tokens', () => {
    const r = redactSecrets('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(r.text).not.toContain('ghp_');
  });
  it('redacts long generic hex strings (likely API keys)', () => {
    const r = redactSecrets('token=0123456789abcdef0123456789abcdef0123456789abcdef');
    expect(r.text).not.toMatch(/0123456789abcdef0123456789abcdef0123456789abcdef/);
  });
  it('leaves harmless text alone', () => {
    const r = redactSecrets('Hello world. The capital of France is Paris.');
    expect(r.text).toBe('Hello world. The capital of France is Paris.');
    expect(r.replaced).toBe(0);
  });
  it('redacts content inside .env-like assignments', () => {
    const r = redactSecrets('DATABASE_URL=postgresql://user:secretpass@host:5432/db\nAPI_KEY=abcd1234efgh5678ijkl9012');
    expect(r.text).not.toContain('secretpass');
    expect(r.text).not.toContain('abcd1234efgh5678ijkl9012');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/main/ai-redactor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/main/ai/redactor.ts`**

```ts
const PATTERNS: Array<{ name: string; re: RegExp; mask: string }> = [
  { name: 'anthropic', re: /sk-ant-[A-Za-z0-9_\-]{12,}/g, mask: '[REDACTED:anthropic-key]' },
  { name: 'openai-proj', re: /sk-proj-[A-Za-z0-9_\-]{12,}/g, mask: '[REDACTED:openai-key]' },
  { name: 'openai', re: /\bsk-[A-Za-z0-9]{20,}/g, mask: '[REDACTED:openai-key]' },
  { name: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}/g, mask: '[REDACTED:github-pat]' },
  { name: 'github-srv', re: /\bghs_[A-Za-z0-9]{20,}/g, mask: '[REDACTED:github-pat]' },
  { name: 'aws-access', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, mask: '[REDACTED:aws-access-key]' },
  { name: 'aws-secret', re: /\b[A-Za-z0-9/+=]{40}\b/g, mask: '[REDACTED:aws-secret]' },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, mask: '[REDACTED:jwt]' },
  { name: 'long-hex', re: /\b[a-f0-9]{40,}\b/g, mask: '[REDACTED:hex-token]' },
  // postgres URLs with credentials embedded
  { name: 'postgres-url', re: /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@]+:[^\s@]+@[^\s/]+/g, mask: '$1://[REDACTED]@host' }
];

const ENV_LINE = /^([A-Z][A-Z0-9_]{1,})\s*=\s*(.+)$/gm;

export interface RedactionResult {
  text: string;
  replaced: number;
}

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let replaced = 0;

  // 1. Mask values in env-style assignments (preserve key name).
  out = out.replace(ENV_LINE, (line, key: string, value: string) => {
    if (!value || value.trim().length === 0) return line;
    if (value.startsWith('[REDACTED')) return line;
    replaced++;
    return `${key}=[REDACTED:env-value]`;
  });

  // 2. Mask high-confidence patterns.
  for (const p of PATTERNS) {
    out = out.replace(p.re, (m, ...groups) => {
      replaced++;
      return p.mask.includes('$1') ? p.mask.replace('$1', String(groups[0])) : p.mask;
    });
  }

  return { text: out, replaced };
}
```

- [ ] **Step 4: Run test**

Run: `pnpm test -- tests/main/ai-redactor.test.ts`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/redactor.ts tests/main/ai-redactor.test.ts
git commit -m "feat(ai): redact secret-shaped tokens before model calls"
```

---

## Task 4: Provider interface + mock provider

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ai\provider.ts`
- Create: `E:\Projects\VibeOps\src\main\ai\providers\mock.ts`
- Create: `E:\Projects\VibeOps\tests\main\ai-mock-provider.test.ts`

- [ ] **Step 1: Write `src/main/ai/provider.ts`**

```ts
import type {
  AIProviderId, AIModel, AIProviderInfo, AICallTrace,
  ProjectAnalysisInput, ProjectAnalysisResult, AITestConnectionResult
} from '@shared/ai';

export interface AIProvider {
  info(): AIProviderInfo;
  testConnection(args: { model?: AIModel; signal?: AbortSignal }): Promise<AITestConnectionResult>;
  analyzeProject(input: ProjectAnalysisInput, opts: { model?: AIModel; maxTokens?: number; temperature?: number; signal?: AbortSignal }): Promise<ProjectAnalysisResult>;
}

export interface ProviderFactory {
  id: AIProviderId;
  build(args: {
    apiKey: string | null;
    defaultModel: AIModel;
    fetchImpl?: typeof fetch;
  }): AIProvider;
}

export function startTrace() {
  const t0 = Date.now();
  return (extra: Partial<AICallTrace>): AICallTrace => ({
    providerId: extra.providerId ?? 'mock',
    model: extra.model ?? 'mock',
    inputTokens: extra.inputTokens ?? null,
    outputTokens: extra.outputTokens ?? null,
    durationMs: Date.now() - t0,
    redactionsApplied: extra.redactionsApplied ?? 0
  });
}
```

- [ ] **Step 2: Write `src/main/ai/providers/mock.ts`**

```ts
import type { AIProvider, ProviderFactory } from '@main/ai/provider';
import { startTrace } from '@main/ai/provider';
import type { AITestConnectionResult, ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';

export const mockProviderFactory: ProviderFactory = {
  id: 'mock',
  build(): AIProvider {
    return {
      info: () => ({
        id: 'mock', name: 'Mock', defaultModel: 'mock',
        models: ['mock'], supportsStructuredOutput: true
      }),
      async testConnection(): Promise<AITestConnectionResult> {
        return { ok: true, providerId: 'mock', model: 'mock', message: 'mock provider connected', durationMs: 1 };
      },
      async analyzeProject(input: ProjectAnalysisInput): Promise<ProjectAnalysisResult> {
        const trace = startTrace();
        const stack = input.detection.frameworks.join(', ') || 'unknown';
        return {
          summary: `Mock analysis of ${input.project.name}. Stack: ${stack}.`,
          keyDirectories: [{ path: 'src', purpose: 'application source' }],
          notableFiles: input.topFiles.slice(0, 3).map((f) => ({ path: f.path, reason: 'high importance score' })),
          risks: input.warnings.map((w) => `${w.code}: ${w.message}`),
          recommendedNextActions: ['Run a deeper audit (Phase 5).'],
          trace: trace({ providerId: 'mock', model: 'mock' })
        };
      }
    };
  }
};
```

- [ ] **Step 3: Write the test**

`tests/main/ai-mock-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mockProviderFactory } from '@main/ai/providers/mock';
import type { ProjectAnalysisInput } from '@shared/ai';

const input: ProjectAnalysisInput = {
  project: { id: 'p1', name: 'Demo', localPath: 'C:/d', description: null, primaryStack: 'Next.js + React' },
  scanSummary: 'Indexed 10 files.',
  detection: {
    projectType: 'Next.js Application',
    frameworks: ['Next.js', 'React'],
    packageManager: 'pnpm', database: 'Supabase Postgres',
    auth: 'Supabase Auth', deployment: 'Vercel'
  },
  topFiles: [
    { path: 'package.json', type: 'config', importance: 100 },
    { path: 'app/page.tsx', type: 'source', importance: 80 }
  ],
  envVarNames: ['DATABASE_URL'],
  warnings: [{ code: 'SECRET_FILE_PRESENT', message: '.env present' }]
};

describe('mock provider', () => {
  it('produces an analysis with required fields', async () => {
    const p = mockProviderFactory.build({ apiKey: null, defaultModel: 'mock' });
    const out = await p.analyzeProject(input, {});
    expect(out.summary).toContain('Mock analysis of Demo');
    expect(out.notableFiles).toHaveLength(2);
    expect(out.risks[0]).toContain('SECRET_FILE_PRESENT');
    expect(out.trace.providerId).toBe('mock');
  });
  it('reports ok=true from testConnection', async () => {
    const p = mockProviderFactory.build({ apiKey: null, defaultModel: 'mock' });
    const r = await p.testConnection({});
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 4: Run test**

Run: `pnpm test -- tests/main/ai-mock-provider.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/ai/provider.ts src/main/ai/providers/mock.ts tests/main/ai-mock-provider.test.ts
git commit -m "feat(ai): provider interface and mock provider"
```

---

## Task 5: Anthropic provider

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ai\providers\anthropic.ts`

- [ ] **Step 1: Add SDK**

Run: `pnpm add @anthropic-ai/sdk`

- [ ] **Step 2: Write `src/main/ai/providers/anthropic.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { startTrace, type AIProvider, type ProviderFactory } from '@main/ai/provider';
import type { AITestConnectionResult, ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';
import { redactSecrets } from '@main/ai/redactor';
import { buildProjectSummaryUserPrompt, PROJECT_SUMMARY_SYSTEM } from '@main/ai/operations/prompt-templates';

const KNOWN_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001'
];

export const anthropicProviderFactory: ProviderFactory = {
  id: 'anthropic',
  build({ apiKey, defaultModel }) {
    function client() {
      if (!apiKey) throw new Error('Anthropic API key not configured.');
      return new Anthropic({ apiKey });
    }

    const provider: AIProvider = {
      info: () => ({
        id: 'anthropic', name: 'Anthropic',
        defaultModel: defaultModel || 'claude-sonnet-4-6',
        models: KNOWN_MODELS, supportsStructuredOutput: true
      }),

      async testConnection({ model, signal }): Promise<AITestConnectionResult> {
        const t0 = Date.now();
        try {
          const c = client();
          const resp = await c.messages.create({
            model: model ?? defaultModel,
            max_tokens: 64,
            messages: [{ role: 'user', content: 'Reply with the single word: pong' }]
          }, { signal });
          const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
          return {
            ok: text.toLowerCase().includes('pong'),
            providerId: 'anthropic',
            model: resp.model,
            message: text.trim() || 'no text returned',
            durationMs: Date.now() - t0
          };
        } catch (err) {
          return {
            ok: false, providerId: 'anthropic', model: model ?? defaultModel,
            message: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - t0
          };
        }
      },

      async analyzeProject(input: ProjectAnalysisInput, opts): Promise<ProjectAnalysisResult> {
        const trace = startTrace();
        const c = client();
        const userPromptRaw = buildProjectSummaryUserPrompt(input);
        const redacted = redactSecrets(userPromptRaw);

        const resp = await c.messages.create({
          model: opts.model ?? defaultModel,
          max_tokens: opts.maxTokens ?? 1500,
          temperature: opts.temperature ?? 0.2,
          system: PROJECT_SUMMARY_SYSTEM,
          messages: [{ role: 'user', content: redacted.text }]
        }, { signal: opts.signal });

        const text = resp.content.find((b) => b.type === 'text')?.text ?? '';
        const parsed = parseStructured(text);

        return {
          summary: parsed.summary,
          keyDirectories: parsed.keyDirectories,
          notableFiles: parsed.notableFiles,
          risks: parsed.risks,
          recommendedNextActions: parsed.recommendedNextActions,
          trace: trace({
            providerId: 'anthropic',
            model: resp.model,
            inputTokens: resp.usage.input_tokens,
            outputTokens: resp.usage.output_tokens,
            redactionsApplied: redacted.replaced
          })
        };
      }
    };

    return provider;
  }
};

interface ParsedAnalysis {
  summary: string;
  keyDirectories: Array<{ path: string; purpose: string }>;
  notableFiles: Array<{ path: string; reason: string }>;
  risks: string[];
  recommendedNextActions: string[];
}

function parseStructured(text: string): ParsedAnalysis {
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    const obj = JSON.parse(cleaned);
    return {
      summary: typeof obj.summary === 'string' ? obj.summary : 'No summary returned.',
      keyDirectories: Array.isArray(obj.keyDirectories) ? obj.keyDirectories.filter(isPathPurpose) : [],
      notableFiles: Array.isArray(obj.notableFiles) ? obj.notableFiles.filter(isPathReason) : [],
      risks: Array.isArray(obj.risks) ? obj.risks.filter((r: unknown) => typeof r === 'string') : [],
      recommendedNextActions: Array.isArray(obj.recommendedNextActions)
        ? obj.recommendedNextActions.filter((r: unknown) => typeof r === 'string')
        : []
    };
  } catch {
    return {
      summary: cleaned.slice(0, 1000),
      keyDirectories: [],
      notableFiles: [],
      risks: [],
      recommendedNextActions: []
    };
  }
}

function isPathPurpose(v: unknown): v is { path: string; purpose: string } {
  return !!v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string' && typeof (v as { purpose?: unknown }).purpose === 'string';
}

function isPathReason(v: unknown): v is { path: string; reason: string } {
  return !!v && typeof v === 'object' && typeof (v as { path?: unknown }).path === 'string' && typeof (v as { reason?: unknown }).reason === 'string';
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/providers/anthropic.ts package.json pnpm-lock.yaml
git commit -m "feat(ai): Anthropic provider with structured project analysis"
```

---

## Task 6: Prompt templates + project summary operation

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ai\operations\prompt-templates.ts`
- Create: `E:\Projects\VibeOps\src\main\ai\operations\project-summary.ts`

- [ ] **Step 1: Write `prompt-templates.ts`**

```ts
import type { ProjectAnalysisInput } from '@shared/ai';

export const PROJECT_SUMMARY_SYSTEM = `You are VibeOps, a project intelligence assistant. You analyze metadata about a software project and produce a concise, plain-English summary.

You will receive:
- Project name and description
- A scan summary (no source code, only metadata)
- Detected stack
- A short list of high-importance file paths
- Names of environment variables (NO values — values are never sent to you)
- Scanner warnings

Constraints:
- Do not invent files or details that are not in the input.
- Do not output sensitive-looking strings; if you see a redaction marker like [REDACTED:...], leave it as-is.
- Output strictly valid JSON matching the schema below. No prose outside the JSON.

Output JSON schema:
{
  "summary": string,                 // 2-4 sentences, plain English
  "keyDirectories": [{ "path": string, "purpose": string }],
  "notableFiles":   [{ "path": string, "reason": string }],
  "risks":          [string],        // each item one sentence
  "recommendedNextActions": [string] // each item one actionable next step
}`;

export function buildProjectSummaryUserPrompt(input: ProjectAnalysisInput): string {
  const lines: string[] = [];
  lines.push(`Project name: ${input.project.name}`);
  if (input.project.description) lines.push(`Description: ${input.project.description}`);
  if (input.project.primaryStack) lines.push(`Primary stack: ${input.project.primaryStack}`);
  lines.push('');
  lines.push('Scan summary:');
  lines.push(input.scanSummary ?? '(no scan)');
  lines.push('');
  lines.push('Detection:');
  lines.push(`- Project type: ${input.detection.projectType ?? '—'}`);
  lines.push(`- Frameworks: ${input.detection.frameworks.join(', ') || '—'}`);
  lines.push(`- Package manager: ${input.detection.packageManager ?? '—'}`);
  lines.push(`- Database: ${input.detection.database ?? '—'}`);
  lines.push(`- Auth: ${input.detection.auth ?? '—'}`);
  lines.push(`- Deployment: ${input.detection.deployment ?? '—'}`);
  lines.push('');
  lines.push(`Top files (path :: type :: importance):`);
  for (const f of input.topFiles.slice(0, 25)) {
    lines.push(`- ${f.path} :: ${f.type} :: ${f.importance}`);
  }
  lines.push('');
  lines.push(`Env variable names: ${input.envVarNames.join(', ') || '—'}`);
  if (input.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of input.warnings) lines.push(`- [${w.code}] ${w.message}`);
  }
  lines.push('');
  lines.push('Return ONLY the JSON described in the system message.');
  return lines.join('\n');
}
```

- [ ] **Step 2: Write `project-summary.ts`**

```ts
import type { AIProvider } from '@main/ai/provider';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectAnalysisInput, ProjectAnalysisResult } from '@shared/ai';

export interface ProjectSummaryDeps {
  provider: AIProvider;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
}

export async function generateProjectSummary(
  deps: ProjectSummaryDeps,
  args: { projectId: string; signal?: AbortSignal }
): Promise<ProjectAnalysisResult> {
  const project = deps.projectsService.byId(args.projectId);
  if (!project) throw new Error(`project ${args.projectId} not found`);

  const scan = deps.scansRepo.latestForProject(project.id);
  const files = scan ? deps.scansRepo.filesByScan(scan.id) : [];
  const envVars = scan ? deps.scansRepo.envVarsByScan(scan.id) : [];

  const input: ProjectAnalysisInput = {
    project: {
      id: project.id, name: project.name, localPath: project.localPath,
      description: project.description, primaryStack: project.primaryStack
    },
    scanSummary: scan?.summary ?? null,
    detection: {
      projectType: scan?.detection.projectType ?? null,
      frameworks: scan?.detection.frameworks ?? [],
      packageManager: scan?.detection.packageManager ?? null,
      database: scan?.detection.database ?? null,
      auth: scan?.detection.auth ?? null,
      deployment: scan?.detection.deployment ?? null
    },
    topFiles: [...files]
      .sort((a, b) => b.importanceScore - a.importanceScore)
      .slice(0, 25)
      .map((f) => ({ path: f.path, type: f.fileType, importance: f.importanceScore })),
    envVarNames: envVars.map((v) => v.variable),
    warnings: scan?.warnings ?? []
  };

  return deps.provider.analyzeProject(input, { signal: args.signal });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ai/operations
git commit -m "feat(ai): project summary prompt and operation"
```

---

## Task 7: Provider registry

**Files:**
- Create: `E:\Projects\VibeOps\src\main\ai\registry.ts`

- [ ] **Step 1: Write the file**

```ts
import type { AIProviderId } from '@shared/types';
import type { AIProvider, ProviderFactory } from './provider';
import { mockProviderFactory } from './providers/mock';
import { anthropicProviderFactory } from './providers/anthropic';
import type { SettingsService } from '@main/settings/service';

const FACTORIES: Record<AIProviderId, ProviderFactory> = {
  mock: mockProviderFactory,
  anthropic: anthropicProviderFactory,
  openai: mockProviderFactory,   // V1.1
  codex: mockProviderFactory     // V1.1
};

export class ProviderRegistry {
  constructor(private readonly settings: SettingsService) {}

  build(id: AIProviderId): AIProvider {
    const cfg = this.settings.read().ai.providers[id];
    if (!cfg) throw new Error(`unknown provider: ${id}`);
    const apiKey = this.settings.getApiKey(id);
    const factory = FACTORIES[id];
    return factory.build({ apiKey, defaultModel: cfg.defaultModel });
  }

  buildActive(): AIProvider {
    const id = this.settings.read().ai.activeProviderId;
    if (!id) throw new Error('No active AI provider configured. Open Settings.');
    return this.build(id);
  }

  buildById(id: AIProviderId): AIProvider {
    return this.build(id);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ai/registry.ts
git commit -m "feat(ai): provider registry resolving from settings"
```

---

## Task 8: IPC channels + handlers

**Files:**
- Modify: `E:\Projects\VibeOps\src\shared\ipc-channels.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\settings-handlers.ts`
- Create: `E:\Projects\VibeOps\src\main\ipc\ai-handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\ipc\handlers.ts`
- Modify: `E:\Projects\VibeOps\src\main\index.ts`

- [ ] **Step 1: Add channels in `src/shared/ipc-channels.ts`**

Append before the closing `} as const`:

```ts
,
  settingsRead: 'settings:read',
  settingsUpdate: 'settings:update',
  settingsSetApiKey: 'settings:setApiKey',
  settingsClearApiKey: 'settings:clearApiKey',

  aiTestConnection: 'ai:testConnection',
  aiGenerateProjectSummary: 'ai:generateProjectSummary'
```

(Final block of channels should include those 6 keys above the `as const`.)

- [ ] **Step 2: Run channels test**

Run: `pnpm test -- tests/shared/ipc-channels.test.ts`
Expected: 4 tests pass.

- [ ] **Step 3: Write `src/main/ipc/settings-handlers.ts`**

```ts
import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { AppSettings, AIProviderId } from '@shared/types';
import type { SettingsService } from '@main/settings/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerSettingsHandlers(svc: SettingsService): void {
  ipcMain.handle(IpcChannels.settingsRead, (): Result<AppSettings> => {
    try { return ok(svc.read()); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsUpdate, (_e, patch: Partial<AppSettings>): Result<AppSettings> => {
    try { return ok(svc.update(patch)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsSetApiKey, (_e, payload: { providerId: AIProviderId; apiKey: string }): Result<true> => {
    try { svc.setApiKey(payload.providerId, payload.apiKey); return ok(true); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.settingsClearApiKey, (_e, providerId: AIProviderId): Result<true> => {
    try { svc.clearApiKey(providerId); return ok(true); } catch (e) { return fail(e); }
  });
}
```

- [ ] **Step 4: Write `src/main/ipc/ai-handlers.ts`**

```ts
import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { AIProviderId } from '@shared/types';
import type { AITestConnectionResult, ProjectAnalysisResult } from '@shared/ai';
import type { ProviderRegistry } from '@main/ai/registry';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import { generateProjectSummary } from '@main/ai/operations/project-summary';

export interface AIContext {
  registry: ProviderRegistry;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  logger: Logger;
}

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerAIHandlers(ctx: AIContext): void {
  ipcMain.handle(IpcChannels.aiTestConnection, async (_e, providerId: AIProviderId): Promise<Result<AITestConnectionResult>> => {
    try {
      const provider = ctx.registry.buildById(providerId);
      return ok(await provider.testConnection({}));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.aiGenerateProjectSummary, async (_e, projectId: string): Promise<Result<ProjectAnalysisResult>> => {
    try {
      const provider = ctx.registry.buildActive();
      const result = await generateProjectSummary({
        provider, projectsService: ctx.projectsService, scansRepo: ctx.scansRepo
      }, { projectId });
      ctx.logger.info({ projectId, redactions: result.trace.redactionsApplied }, 'project summary generated');
      return ok(result);
    } catch (e) { return fail(e); }
  });
}
```

- [ ] **Step 5: Re-export from `handlers.ts`**

Append:

```ts
export { registerSettingsHandlers } from './settings-handlers';
export { registerAIHandlers } from './ai-handlers';
```

- [ ] **Step 6: Wire into `src/main/index.ts`**

Add imports:

```ts
import { SettingsService } from './settings/service';
import { getSecretStore } from './settings/safe-storage';
import { ProviderRegistry } from './ai/registry';
import { registerSettingsHandlers, registerAIHandlers } from './ipc/handlers';
import path from 'node:path';
```

Inside `bootstrap()`, after `const memoryService = new MemoryService(...);`, add:

```ts
  const settingsService = new SettingsService({
    settingsPath: path.join(paths.root, 'settings.json'),
    secretsPath: path.join(paths.root, 'secrets.json'),
    secretStore: getSecretStore()
  });
  const aiRegistry = new ProviderRegistry(settingsService);
```

After the `registerMemoryHandlers({...})` block, add:

```ts
  registerSettingsHandlers(settingsService);
  registerAIHandlers({
    registry: aiRegistry,
    projectsService,
    scansRepo,
    logger: log
  });
```

- [ ] **Step 7: Tests + typecheck**

Run: `pnpm build:typecheck && pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc/settings-handlers.ts src/main/ipc/ai-handlers.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(ipc): settings and AI handlers wired into bootstrap"
```

---

## Task 9: Preload exposes settings + ai namespaces

**Files:**
- Modify: `E:\Projects\VibeOps\src\preload\api.ts`

- [ ] **Step 1: Add types and namespaces**

Imports to add at top:

```ts
import type { AppSettings, AIProviderId } from '@shared/types';
import type { AITestConnectionResult, ProjectAnalysisResult } from '@shared/ai';
```

Add inside the `api` object:

```ts
  settings: {
    read: (): Promise<AppSettings> => unwrap(ipcRenderer.invoke(IpcChannels.settingsRead)),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsUpdate, patch)),
    setApiKey: (providerId: AIProviderId, apiKey: string): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsSetApiKey, { providerId, apiKey })),
    clearApiKey: (providerId: AIProviderId): Promise<true> =>
      unwrap(ipcRenderer.invoke(IpcChannels.settingsClearApiKey, providerId))
  },
  ai: {
    testConnection: (providerId: AIProviderId): Promise<AITestConnectionResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiTestConnection, providerId)),
    generateProjectSummary: (projectId: string): Promise<ProjectAnalysisResult> =>
      unwrap(ipcRenderer.invoke(IpcChannels.aiGenerateProjectSummary, projectId))
  }
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm build:typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/preload/api.ts
git commit -m "feat(preload): settings + ai namespaces"
```

---

## Task 10: Settings hooks and AI hooks

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\settings\useSettings.ts`

- [ ] **Step 1: Write hooks**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AppSettings, AIProviderId } from '@shared/types';
import type { ProjectAnalysisResult } from '@shared/ai';

const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api.settings.read() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.settings.update(patch),
    onSuccess: (s) => qc.setQueryData(settingsKey, s)
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, apiKey }: { providerId: AIProviderId; apiKey: string }) =>
      api.settings.setApiKey(providerId, apiKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey })
  });
}

export function useClearApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: AIProviderId) => api.settings.clearApiKey(providerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey })
  });
}

export function useTestConnection() {
  return useMutation({ mutationFn: (providerId: AIProviderId) => api.ai.testConnection(providerId) });
}

export function useGenerateProjectSummary() {
  return useMutation<ProjectAnalysisResult, Error, string>({
    mutationFn: (projectId: string) => api.ai.generateProjectSummary(projectId)
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/features/settings/useSettings.ts
git commit -m "feat(settings): renderer hooks for settings and AI ops"
```

---

## Task 11: Provider form + Test Connection button

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\settings\TestConnectionButton.tsx`
- Create: `E:\Projects\VibeOps\src\renderer\features\settings\ProviderForm.tsx`

- [ ] **Step 1: Write `TestConnectionButton.tsx`**

```tsx
import { useState } from 'react';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTestConnection } from './useSettings';
import type { AIProviderId } from '@shared/types';
import type { AITestConnectionResult } from '@shared/ai';

export function TestConnectionButton({ providerId }: { providerId: AIProviderId }) {
  const test = useTestConnection();
  const [last, setLast] = useState<AITestConnectionResult | null>(null);

  async function run() {
    try {
      const r = await test.mutateAsync(providerId);
      setLast(r);
    } catch (e) {
      setLast({ ok: false, providerId, model: '—', message: (e as Error).message, durationMs: 0 });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={run} disabled={test.isPending}>
        <Plug className="h-4 w-4" /> {test.isPending ? 'Testing…' : 'Test Connection'}
      </Button>
      {last && (
        <div className="flex items-center gap-2 text-xs">
          <Badge variant={last.ok ? 'success' : 'destructive'}>{last.ok ? 'OK' : 'Failed'}</Badge>
          <span className="text-muted-foreground">{last.message}</span>
          <span className="text-muted-foreground">· {last.durationMs}ms</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write `ProviderForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TestConnectionButton } from './TestConnectionButton';
import { useSetApiKey, useClearApiKey, useUpdateSettings } from './useSettings';
import type { AIProviderId, AppSettings } from '@shared/types';

interface Props {
  settings: AppSettings;
  providerId: AIProviderId;
}

const NAMES: Record<AIProviderId, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (V1.1)',
  codex: 'Codex (V1.1)',
  mock: 'Mock provider (testing)'
};

export function ProviderForm({ settings, providerId }: Props) {
  const provider = settings.ai.providers[providerId];
  const setKey = useSetApiKey();
  const clearKey = useClearApiKey();
  const update = useUpdateSettings();
  const [apiKey, setApiKeyInput] = useState('');
  const [model, setModel] = useState(provider.defaultModel);
  const [error, setError] = useState<string | null>(null);
  const isActive = settings.ai.activeProviderId === providerId;

  useEffect(() => { setModel(provider.defaultModel); }, [provider.defaultModel]);

  async function saveKey() {
    setError(null);
    if (!apiKey.trim()) return setError('Enter an API key first.');
    try {
      await setKey.mutateAsync({ providerId, apiKey: apiKey.trim() });
      setApiKeyInput('');
    } catch (e) { setError((e as Error).message); }
  }

  async function setAsActive() {
    setError(null);
    try {
      await update.mutateAsync({
        ai: { ...settings.ai, activeProviderId: providerId }
      });
    } catch (e) { setError((e as Error).message); }
  }

  async function persistModel() {
    try {
      await update.mutateAsync({
        ai: {
          ...settings.ai,
          providers: { ...settings.ai.providers, [providerId]: { ...provider, defaultModel: model } }
        }
      });
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">{NAMES[providerId]}</CardTitle>
          <CardDescription>
            {provider.apiKeyPresent ? 'API key stored locally' : 'No API key stored'}
            {isActive && <> · <Badge variant="success">active</Badge></>}
          </CardDescription>
        </div>
        {!isActive && provider.apiKeyPresent && (
          <Button variant="outline" size="sm" onClick={setAsActive}>Set as active</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>API Key</Label>
          <div className="flex gap-2">
            <Input type="password" value={apiKey} onChange={(e) => setApiKeyInput(e.target.value)} placeholder={provider.apiKeyPresent ? '•••••••• stored' : 'Paste key'} />
            <Button onClick={saveKey} disabled={setKey.isPending}>Save</Button>
            {provider.apiKeyPresent && (
              <Button variant="ghost" onClick={() => clearKey.mutate(providerId)}>Clear</Button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Default Model</Label>
          <div className="flex gap-2">
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
            <Button variant="outline" onClick={persistModel} disabled={update.isPending}>Save model</Button>
          </div>
        </div>
        <TestConnectionButton providerId={providerId} />
        {error && <div className="text-sm text-destructive">{error}</div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/settings
git commit -m "feat(settings): provider form with key save, model edit, test connection"
```

---

## Task 12: Settings page

**Files:**
- Modify: `E:\Projects\VibeOps\src\renderer\routes\SettingsRoute.tsx`

- [ ] **Step 1: Replace contents**

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProviderForm } from '@/features/settings/ProviderForm';
import { useSettings } from '@/features/settings/useSettings';
import type { AIProviderId } from '@shared/types';

const PROVIDERS: AIProviderId[] = ['anthropic', 'mock'];

export function SettingsRoute() {
  const { data: settings, isLoading } = useSettings();
  if (isLoading || !settings) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Local configuration. API keys are stored at <code>%APPDATA%\VibeOps\secrets.json</code> and encrypted by Electron safeStorage when available.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Providers</CardTitle>
          <CardDescription>
            Active provider: <span className="font-medium">{settings.ai.activeProviderId ?? 'none'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDERS.map((id) => <ProviderForm key={id} settings={settings} providerId={id} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>VibeOps is read-only by default. Shell command modes ship in V1.1.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-5 space-y-1">
            <li>Shell command mode: <span className="font-medium">{settings.security.shellCommandMode}</span></li>
            <li>Allow AI cloud calls: <span className="font-medium">{settings.security.allowAiCloudCalls ? 'yes' : 'no'}</span></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/routes/SettingsRoute.tsx
git commit -m "feat(settings): full Settings route with provider configuration"
```

---

## Task 13: Project summary card on Overview tab

**Files:**
- Create: `E:\Projects\VibeOps\src\renderer\features\projects\ProjectSummaryCard.tsx`
- Modify: `E:\Projects\VibeOps\src\renderer\routes\projects\ProjectOverviewTab.tsx`

- [ ] **Step 1: Write `ProjectSummaryCard.tsx`**

```tsx
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGenerateProjectSummary } from '@/features/settings/useSettings';
import type { ProjectAnalysisResult } from '@shared/ai';

interface Props {
  projectId: string;
}

export function ProjectSummaryCard({ projectId }: Props) {
  const gen = useGenerateProjectSummary();
  const [result, setResult] = useState<ProjectAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const r = await gen.mutateAsync(projectId);
      setResult(r);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">AI Project Summary</CardTitle>
          <CardDescription>
            Runs the active AI provider on the latest scan summary. Source code is not sent. Secret-shaped tokens are redacted.
          </CardDescription>
        </div>
        <Button onClick={run} disabled={gen.isPending}>
          <Sparkles className="h-4 w-4" /> {gen.isPending ? 'Thinking…' : 'Generate Summary'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="text-sm text-destructive">{error}</div>}
        {result && (
          <>
            <p className="text-sm leading-relaxed">{result.summary}</p>
            {result.recommendedNextActions.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Recommended next actions</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {result.recommendedNextActions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {result.risks.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Risks</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {result.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{result.trace.providerId} · {result.trace.model}</Badge>
              <span>{result.trace.durationMs}ms</span>
              {result.trace.inputTokens !== null && <span>· in {result.trace.inputTokens}</span>}
              {result.trace.outputTokens !== null && <span>· out {result.trace.outputTokens}</span>}
              <span>· redactions {result.trace.redactionsApplied}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add card to `ProjectOverviewTab.tsx`**

After the existing "Detected Stack" `Card`, add:

```tsx
import { ProjectSummaryCard } from '@/features/projects/ProjectSummaryCard';
```

And inside the returned JSX, append a new `<ProjectSummaryCard projectId={project.id} />` element after the Detected Stack card (inside the outer wrapper `<div className="space-y-4">`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/projects/ProjectSummaryCard.tsx src/renderer/routes/projects/ProjectOverviewTab.tsx
git commit -m "feat(projects): AI summary card on overview tab"
```

---

## Task 14: Phase 4 acceptance check

- [ ] **Step 1: Run quality gate**

Run: `pnpm test && pnpm build:typecheck && pnpm build`
Expected: all three exit 0.

- [ ] **Step 2: Manual flow against PRD §14.6**

Run: `pnpm dev`.

Verify:
- Open Settings → Anthropic provider visible. Paste a real `sk-ant-...` API key → Save → success message.
- Click Test Connection → "OK" badge with "pong" or short reply.
- Set as active → Active badge moves to Anthropic.
- Open `%APPDATA%\VibeOps\secrets.json` in a text editor: API key is stored as `safe:<base64>` (or `unsafe:<base64>` if safeStorage unavailable). Open `settings.json`: contains no plaintext key.
- Open a project that has a Phase 2 scan → Overview tab → Generate Summary.
- Summary populates within 5-30 seconds. Trace badge shows `anthropic · <model>`. Token counts present.
- Provider error path: disable network or use bad key → Test Connection shows "Failed" with provider error message.
- Switch active provider to "mock" → Generate Summary returns deterministic mock output instantly with `mock` trace.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a phase-4 -m "Phase 4 complete: AI provider MVP"
```

---

## Self-Review Notes

- **Spec coverage (PRD §14.6):** at least one provider configurable ✓ (Anthropic + Mock), test call ✓ (`testConnection`), summary generation using scan summaries ✓ (`generateProjectSummary` uses `scan.summary` and metadata only), provider swap ✓ (registry resolves from settings), failed AI calls show clear errors ✓ (Result envelope + UI surfacing).
- **Spec coverage (PRD §21.5 AI safety):** ignored files never sent (provider only sees the metadata we hand it), env values never sent (we send names only), redactor strips secret-shaped tokens, model/provider visible in trace, local-only mode preserved as a per-provider flag for future.
- **Type consistency:** `AIProviderId` consistent end-to-end. `AICallTrace` shape matches between `mock`, `anthropic`, and renderer display. `AppSettings.ai.providers` keyed by all known IDs (anthropic/openai/codex/mock) with default config.
- **Risks:**
  - safeStorage availability varies (Electron docs note that on Linux without a desktop keyring it falls back to plaintext). The `unsafe:` prefix labels these and we still keep the secret outside `settings.json`.
  - The `aws-secret` regex (40 chars base64) is broad; it can over-redact long hashes in user content. Acceptable: false positives are safer than leaks for the summary use-case.
  - JSON parsing of model output is best-effort. If the provider returns prose, we store the prose as `summary` and leave structured fields empty.
- **Phase boundary:** Audit engine (Phase 5) consumes the same `ProviderRegistry` and adds new operations beside `project-summary`.
