import { useState } from 'react';
import { Trash2, Plus, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceList, useCreateWorkspace, useRenameWorkspace, useRemoveWorkspace } from './useWorkspaces';
import { toast } from '@/lib/toast';

export function ManageWorkspacesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: list = [] } = useWorkspaceList();
  const create = useCreateWorkspace();
  const rename = useRenameWorkspace();
  const remove = useRemoveWorkspace();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  async function onCreate() {
    if (!name.trim()) return;
    try { await create.mutateAsync({ name }); setName(''); toast.success('Workspace created'); }
    catch (e) { toast.error('Create failed', (e as Error).message); }
  }
  async function onRename() {
    if (!editing) return;
    try { await rename.mutateAsync(editing); setEditing(null); toast.success('Renamed'); }
    catch (e) { toast.error('Rename failed', (e as Error).message); }
  }
  async function onRemove(id: string) {
    if (!window.confirm('Remove this workspace? Projects will be reassigned to the default Local Workspace by manual edit.')) return;
    try { await remove.mutateAsync(id); toast.success('Removed'); }
    catch (e) { toast.error('Remove failed', (e as Error).message); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Workspaces</DialogTitle>
          <DialogDescription>Workspaces group projects locally. They are not synced.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>New workspace</Label>
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme client" />
              <Button onClick={onCreate} disabled={create.isPending}><Plus className="h-4 w-4" /> Create</Button>
            </div>
          </div>
          <div className="space-y-1">
            {list.map((w) => (
              <div key={w.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                {editing?.id === w.id ? (
                  <>
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    <Button size="sm" onClick={onRename}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{w.name}</div>
                      <div className="text-xs text-muted-foreground">{w.slug}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ id: w.id, name: w.name })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onRemove(w.id)} disabled={w.id === 'ws_local'}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
