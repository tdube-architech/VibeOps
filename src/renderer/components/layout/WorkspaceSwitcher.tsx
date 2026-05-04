import { ChevronsUpDown, Plus, Settings as SettingsIcon } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, Check
} from '@/components/ui/dropdown-menu';
import { useWorkspaceList, useActiveWorkspaceId, useSetActiveWorkspace } from '@/features/workspaces/useWorkspaces';
import { ManageWorkspacesDialog } from '@/features/workspaces/ManageWorkspacesDialog';

export function WorkspaceSwitcher() {
  const { data: list = [] } = useWorkspaceList();
  const activeId = useActiveWorkspaceId();
  const setActive = useSetActiveWorkspace();
  const [manageOpen, setManageOpen] = useState(false);
  const active = list.find((w) => w.id === activeId) ?? list[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md border border-border bg-card/40 px-3 py-2 text-left hover:bg-secondary/40">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground text-sm font-bold">V</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">VibeOps</div>
            <div className="text-xs text-muted-foreground truncate">{active?.name ?? 'No workspace'}</div>
          </div>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {list.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => setActive.mutate(w.id)}>
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === activeId && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            <Plus className="h-4 w-4" /> New workspace
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            <SettingsIcon className="h-4 w-4" /> Manage workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ManageWorkspacesDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}
