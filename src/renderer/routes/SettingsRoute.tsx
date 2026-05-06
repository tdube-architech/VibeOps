import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProviderForm } from '@/features/settings/ProviderForm';
import { useSettings } from '@/features/settings/useSettings';
import { DataManagementCard } from '@/features/data/DataManagementCard';
import { LogsViewerCard } from '@/features/data/LogsViewerCard';
import { UpdateCard } from '@/features/update/UpdateCard';
import { RulePackCard } from '@/features/rule-pack/RulePackCard';
import { AccountCard } from '@/features/auth/AccountCard';
import { MigrationCard } from '@/features/migrate/MigrationCard';
import { WorkspaceMembersCard } from '@/features/workspaces/WorkspaceMembersCard';
import { BillingCard } from '@/features/billing/BillingCard';
import { GitHubIntegrationCard } from '@/features/settings/GitHubIntegrationCard';
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
          Configure account, workspace, integrations, and updates.
        </p>
      </div>

      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="ai">AI Providers</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="audit">Audit Engine</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="updates">Updates</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <AccountCard />
        </TabsContent>

        <TabsContent value="workspace" className="space-y-4">
          <BillingCard />
          <WorkspaceMembersCard />
          <MigrationCard />
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
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
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <GitHubIntegrationCard />
        </TabsContent>

        <TabsContent value="audit" className="space-y-4">
          <RulePackCard />
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          <DataManagementCard />
          <LogsViewerCard />
        </TabsContent>

        <TabsContent value="updates" className="space-y-4">
          <UpdateCard />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Security</CardTitle>
              <CardDescription>
                API keys are stored at <code>%APPDATA%\VibeOps\secrets.json</code> and encrypted
                by Electron safeStorage when available. VibeOps is read-only by default.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc pl-5 space-y-1">
                <li>Shell command mode: <span className="font-medium">{settings.security.shellCommandMode}</span></li>
                <li>Allow AI cloud calls: <span className="font-medium">{settings.security.allowAiCloudCalls ? 'yes' : 'no'}</span></li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
