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

export function migrateSettings(unknown: unknown): AppSettings {
  return mergeDeep(DEFAULT_SETTINGS, (unknown ?? {}) as Partial<AppSettings>);
}

export { mergeDeep };
