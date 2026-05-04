import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Project } from '@shared/types';

interface Props {
  existing: Project | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DuplicatePathDialog({ existing, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={!!existing} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Path already registered</DialogTitle>
          <DialogDescription>
            This folder is already tracked as <span className="font-medium">{existing?.name}</span>. Add it again anyway?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm}>Add Again</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
