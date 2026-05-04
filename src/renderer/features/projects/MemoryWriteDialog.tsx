import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { MemoryFileStatus } from '@shared/types';

interface Props {
  open: boolean;
  fileStatus: MemoryFileStatus | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function MemoryWriteDialog({ open, fileStatus, onOpenChange, onConfirm }: Props) {
  const exists = fileStatus?.exists === true;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{exists ? 'Overwrite memory.md?' : 'Write memory.md?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {exists ? (
              <>A <code className="font-mono">memory.md</code> already exists at <code className="font-mono">{fileStatus.filePath}</code>. A timestamped backup will be saved before replacement.</>
            ) : (
              <>Write the current draft to <code className="font-mono">{fileStatus?.filePath}</code>. VibeOps will create the file in the project root.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{exists ? 'Backup and overwrite' : 'Write file'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
