import { ListPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuditFinding } from '@shared/types';
import { useUpdateFinding } from './useAudits';
import { useCreateTaskFromFinding } from '@/features/tasks/useTasks';
import { toast } from '@/lib/toast';

const SEV_BADGE: Record<AuditFinding['severity'], 'default' | 'secondary' | 'warning' | 'destructive' | 'outline' | 'success'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'default',
  low: 'secondary',
  info: 'outline'
};

export function FindingsTable({ findings }: { findings: AuditFinding[] }) {
  const update = useUpdateFinding();
  const createTask = useCreateTaskFromFinding();
  if (findings.length === 0) {
    return <div className="text-sm text-muted-foreground">No findings yet.</div>;
  }
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="space-y-2">
      {sorted.map((f) => (
        <div key={f.id} className="rounded-md border border-border bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={SEV_BADGE[f.severity]}>{f.severity}</Badge>
                <Badge variant="outline">{f.category}</Badge>
                {f.status !== 'open' && <Badge variant="secondary">{f.status}</Badge>}
                <span className="font-medium">{f.title}</span>
              </div>
              {f.filePath && <div className="text-xs font-mono text-muted-foreground">{f.filePath}</div>}
              {f.description && <p className="text-sm text-muted-foreground">{f.description}</p>}
              {f.recommendation && (
                <p className="text-sm">
                  <span className="font-medium">Fix:</span> {f.recommendation}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => createTask.mutate(f.id, {
                  onSuccess: () => toast.success('Task created from finding'),
                  onError: (e) => toast.error('Failed', (e as Error).message)
                })}
              >
                <ListPlus className="h-4 w-4" /> Create task
              </Button>
              <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, status: 'fixed' })}>Mark fixed</Button>
              <Button variant="ghost" size="sm" onClick={() => update.mutate({ id: f.id, status: 'ignored' })}>Ignore</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
