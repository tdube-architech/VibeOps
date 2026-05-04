import type { AIProviderId } from '@shared/types';
import type { AIProvider, ProviderFactory } from './provider';
import { mockProviderFactory } from './providers/mock';
import { anthropicProviderFactory } from './providers/anthropic';
import type { SettingsService } from '@main/settings/service';

const FACTORIES: Record<AIProviderId, ProviderFactory> = {
  mock: mockProviderFactory,
  anthropic: anthropicProviderFactory,
  openai: mockProviderFactory,
  codex: mockProviderFactory
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
