import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';
import { TrashView } from './TrashView';
import { useTrashList } from './useTasks';

export function TrashDock() {
  const [open, setOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });
  const { data: trash = [] } = useTrashList();

  return (
    <>
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => setOpen(true)}
        className={[
          'fixed bottom-6 right-6 z-40 grid h-14 w-14 place-items-center rounded-full border shadow-lg transition',
          isOver ? 'scale-110 border-destructive bg-destructive/10 ring-2 ring-destructive' : 'border-border bg-popover'
        ].join(' ')}
        title={`Trash · ${trash.length}`}
      >
        <Trash2 className="h-5 w-5" />
        {trash.length > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {trash.length > 99 ? '99+' : trash.length}
          </span>
        )}
      </button>
      <TrashView open={open} onOpenChange={setOpen} />
    </>
  );
}
