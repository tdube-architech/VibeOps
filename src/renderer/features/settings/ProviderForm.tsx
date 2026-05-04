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
