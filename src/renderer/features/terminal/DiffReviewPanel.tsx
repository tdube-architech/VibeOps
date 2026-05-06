import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, FileEdit, FileMinus, FilePlus2, X, Undo2 } from 'lucide-react';
import {
  listSessionDiffs,
  updateDiffStatus,
  useSessionDiffsRealtime,
  type AiSessionDiff
} from '@/lib/data/aiSessions';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

interface Props {
  sessionId: string;
  /** Owner-only: cwd of the local terminal session, used to physically revert files. */
  ownerContext?: { cwd: string; sessionStartSha: string | null };
}

export function DiffReviewPanel({ sessionId, ownerContext }: Props) {
  const [diffs, setDiffs] = useState<AiSessionDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const canResolve = !!ownerContext;

  const refresh = useCallback(async () => {
    try { setDiffs(await listSessionDiffs(sessionId)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useSessionDiffsRealtime(sessionId, refresh);

  async function resolve(diff: AiSessionDiff, status: 'applied' | 'reverted' | 'rejected'): Promise<void> {
    try {
      if (status === 'reverted') {
        if (!ownerContext) {
          toast.error('Only the session owner can revert files', 'These files only exist on the owner\'s machine.');
          return;
        }
        await api.aiSession.revertFile({
          cwd: ownerContext.cwd,
          filePath: diff.filePath,
          diffKind: diff.diffKind,
          sha: ownerContext.sessionStartSha
        });
      }
      await updateDiffStatus(diff.id, status);
      await refresh();
    } catch (e) {
      toast.error('Could not update diff', (e as Error).message);
    }
  }

  if (loading && diffs.length === 0) return null;
  if (diffs.length === 0) return null;

  const proposed = diffs.filter((d) => d.status === 'proposed');
  const resolved = diffs.filter((d) => d.status !== 'proposed');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">File changes captured</CardTitle>
        <CardDescription>
          {proposed.length} pending · {resolved.length} resolved
          {canResolve
            ? ' · Revert restores the file from your git HEAD at session start.'
            : ' · Read-only: only the session owner can resolve.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {[...proposed, ...resolved].map((d) => (
          <DiffRow
            key={d.id}
            diff={d}
            canResolve={canResolve}
            canRevert={canResolve && (d.diffKind === 'create' || ownerContext?.sessionStartSha != null)}
            onResolve={resolve}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DiffRow({
  diff,
  canResolve,
  canRevert,
  onResolve
}: {
  diff: AiSessionDiff;
  canResolve: boolean;
  canRevert: boolean;
  onResolve: (d: AiSessionDiff, s: 'applied' | 'reverted' | 'rejected') => void;
}) {
  const Icon = diff.diffKind === 'create' ? FilePlus2 : diff.diffKind === 'delete' ? FileMinus : FileEdit;
  const tone = diff.diffKind === 'create' ? 'text-emerald-500'
    : diff.diffKind === 'delete' ? 'text-red-500' : 'text-amber-500';
  const isPending = diff.status === 'proposed';
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border p-2">
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <div className="truncate text-sm font-mono">{diff.filePath}</div>
          <div className="text-xs text-muted-foreground">
            {diff.diffKind} · {diff.sizeBytes != null ? `${diff.sizeBytes} B` : '—'}
            {' · '}
            <span className={isPending ? 'text-amber-500' : 'text-muted-foreground'}>
              {diff.status}
            </span>
            {diff.resolvedAt && (
              <> · resolved {new Date(diff.resolvedAt).toLocaleTimeString()}</>
            )}
          </div>
        </div>
      </div>
      {canResolve && isPending && (
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="outline" onClick={() => onResolve(diff, 'applied')}>
            <Check className="h-3.5 w-3.5" /> Keep
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canRevert}
            title={canRevert ? 'Revert file to session-start state' : 'Revert needs a git repo at session start'}
            onClick={() => onResolve(diff, 'reverted')}
          >
            <Undo2 className="h-3.5 w-3.5" /> Revert
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onResolve(diff, 'rejected')}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
        </div>
      )}
    </div>
  );
}
