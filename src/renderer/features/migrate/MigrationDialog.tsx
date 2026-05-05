import { useEffect, useMemo, useState } from 'react';
import { Upload, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useMigrationStatus, useRunMigration } from './useMigrate';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MigrationDialog({ open, onOpenChange }: Props) {
  const { unmigrated, loading, refresh } = useMigrationStatus();
  const { progress, run } = useRunMigration();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (unmigrated && selected.size === 0) {
      setSelected(new Set(unmigrated.map((p) => p.id)));
    }
  }, [unmigrated, selected.size]);

  const allSelected = useMemo(() =>
    !!unmigrated && unmigrated.length > 0 && unmigrated.every((p) => selected.has(p.id)),
    [unmigrated, selected]
  );

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!unmigrated) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(unmigrated.map((p) => p.id)));
  }

  async function onUpload() {
    if (!unmigrated) return;
    const list = unmigrated.filter((p) => selected.has(p.id));
    const errors = await run(list);
    if (errors.length === 0) {
      toast.success(`Uploaded ${list.length} project${list.length === 1 ? '' : 's'}`);
      onOpenChange(false);
      void refresh();
    } else {
      toast.error(`Uploaded ${list.length - errors.length} of ${list.length}`, `${errors.length} failed`);
      void refresh();
    }
  }

  async function onSkip() {
    await api.migrate.skip();
    toast.info('Skipped — open Settings to migrate later.');
    onOpenChange(false);
  }

  const running = progress !== null && !progress.finished;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Migrate local projects to your workspace</DialogTitle>
          <DialogDescription>
            We found projects that haven&apos;t been uploaded yet. Pick which to upload to the
            active workspace. Local file paths stay private to this machine.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Scanning local projects…</div>
        ) : !unmigrated || unmigrated.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Nothing to migrate.</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
              <button
                onClick={toggleAll}
                className="text-primary hover:underline"
                type="button"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-muted-foreground">{selected.size} of {unmigrated.length} selected</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto py-2">
              {unmigrated.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-secondary/40"
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    disabled={running}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate">{p.localPath}</div>
                    {p.primaryStack && (
                      <div className="text-xs text-muted-foreground">{p.primaryStack}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {progress && (
          <div className="rounded-md border border-border p-3 text-xs">
            {progress.finished ? (
              <>
                Finished. {progress.done - progress.errors.length}/{progress.total} succeeded.
                {progress.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-destructive">
                    {progress.errors.map((e) => <li key={e.id}>{e.name}: {e.message}</li>)}
                  </ul>
                )}
              </>
            ) : (
              <>Uploading {progress.current ?? '…'} ({progress.done}/{progress.total})</>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip} disabled={running}>
            <X className="h-4 w-4" /> Skip for now
          </Button>
          <Button
            onClick={onUpload}
            disabled={running || loading || !unmigrated || selected.size === 0}
          >
            <Upload className="h-4 w-4" /> Upload {selected.size > 0 ? `${selected.size} project${selected.size === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
