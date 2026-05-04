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
