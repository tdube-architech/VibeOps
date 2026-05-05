import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { RulePackUpdateResult } from '@shared/rule-pack';

const RULE_PACK_KEY = ['rule-pack', 'state'] as const;

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

export function RulePackCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: RULE_PACK_KEY,
    queryFn: () => api.rulePack.state()
  });
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    return api.rulePack.onState((r: RulePackUpdateResult) => {
      qc.invalidateQueries({ queryKey: RULE_PACK_KEY });
      if (r.status === 'updated') {
        toast.success('Rule pack updated', `Now on ${r.latestVersion} with fresh vulnerability rules.`);
      } else if (r.status === 'error') {
        toast.error('Rule pack update failed', r.message ?? r.errorCode ?? 'unknown');
      }
    });
  }, [qc]);

  async function handleCheck() {
    setChecking(true);
    try {
      const result = await api.rulePack.checkUpdate();
      if (result.status === 'updated') toast.success('Rule pack updated', result.message ?? '');
      else if (result.status === 'up-to-date') toast.info('Rule pack up-to-date', result.message ?? '');
      else if (result.status === 'disabled') toast.info('Rule pack updates disabled', result.message ?? '');
      else if (result.status === 'error') toast.error('Update check failed', result.message ?? result.errorCode ?? 'unknown');
      qc.invalidateQueries({ queryKey: RULE_PACK_KEY });
    } catch (e) {
      toast.error('Update check failed', (e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const manifest = data?.manifest ?? null;
  const lastError = data?.lastError ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vulnerability Rule Pack</CardTitle>
        <CardDescription>
          Offline audit rules covering OWASP, known-vulnerable packages, and AI-code anti-patterns. Updates check daily; no customer tokens are used.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : manifest ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs uppercase text-muted-foreground">Pack</div>
                <div className="flex flex-1 items-center gap-2">
                  <code className="text-xs">{String(manifest.packId)}</code>
                  <Badge variant={manifest.source === 'remote' ? 'success' : 'secondary'}>
                    {String(manifest.source)}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs uppercase text-muted-foreground">Version</div>
                <div className="flex-1 font-mono text-sm">{String(manifest.packVersion ?? '—')}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs uppercase text-muted-foreground">Rules</div>
                <div className="flex-1 text-sm">{String(manifest.ruleCount ?? '—')}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs uppercase text-muted-foreground">Published</div>
                <div className="flex-1 text-sm">{formatTimestamp(manifest.publishedAt ?? null)}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs uppercase text-muted-foreground">Last Checked</div>
                <div className="flex-1 text-sm">{formatTimestamp(data?.lastCheckedAt ?? null)}</div>
              </div>
            </div>
            {manifest.description && (
              <div className="text-xs text-muted-foreground">{manifest.description}</div>
            )}
            {lastError && (
              <div className="text-xs text-destructive">Last error: {lastError}</div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground">No rule pack loaded.</div>
        )}
        <div className="pt-2">
          <Button onClick={handleCheck} disabled={checking} variant="outline">
            {checking ? 'Checking…' : 'Check for updates'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
