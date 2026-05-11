import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, RotateCcw } from 'lucide-react';
import { useTrashList, useRestoreTask, useEmptyTrash } from './useTasks';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { relativeTime } from '@/lib/relative-time';
import { toast } from '@/lib/toast';

export function TrashView({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: trash = [] } = useTrashList();
  const restore = useRestoreTask();
  const empty = useEmptyTrash();
  const wsId = useActiveWorkspaceId();

  function onEmpty() {
    if (!wsId) return;
    if (!window.confirm(`Permanently delete all ${trash.length} task(s) in trash?`)) return;
    empty.mutate(wsId, {
      onSuccess: (n) => toast.success('Trash emptied', `${n} task(s) permanently deleted`)
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Tasks here are restorable. Items older than 30 days are permanently deleted automatically.
          </DialogDescription>
        </DialogHeader>
        {trash.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Trash is empty.</div>
        ) : (
          <ul className="divide-y divide-border max-h-96 overflow-y-auto">
            {trash.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    Deleted {t.deletedAt ? <span title={t.deletedAt}>{relativeTime(t.deletedAt)}</span> : '—'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => restore.mutate(t.id, {
                    onSuccess: () => toast.success('Restored', t.title)
                  })}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            variant="destructive"
            disabled={trash.length === 0 || empty.isPending}
            onClick={onEmpty}
          >
            <Trash2 className="mr-1 h-4 w-4" /> Empty Trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
