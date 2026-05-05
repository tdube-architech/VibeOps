import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProviderForm } from '@/features/settings/ProviderForm';
import { useSettings } from '@/features/settings/useSettings';
import { DataManagementCard } from '@/features/data/DataManagementCard';
import { LogsViewerCard } from '@/features/data/LogsViewerCard';
import { UpdateCard } from '@/features/update/UpdateCard';
import { RulePackCard } from '@/features/rule-pack/RulePackCard';
import { AccountCard } from '@/features/auth/AccountCard';
import { MigrationCard } from '@/features/migrate/MigrationCard';
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

      <AccountCard />
      <MigrationCard />
      <RulePackCard />
      <DataManagementCard />
      <UpdateCard />
      <LogsViewerCard />

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
