import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTaskMembers } from './useTaskMembers';
import { useTaskWatchers, useToggleWatcher } from './useTasks';

export function WatcherChips({ taskId }: { taskId: string }) {
  const { data: members = [] } = useTaskMembers();
  const { data: watcherIds = [] } = useTaskWatchers(taskId);
  const toggle = useToggleWatcher();
  const memberMap = new Map(members.map((m) => [m.userId, m]));
  const eligible = members.filter((m) => !watcherIds.includes(m.userId));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {watcherIds.map((id) => {
        const m = memberMap.get(id);
        const label = m?.displayName ?? m?.email ?? id.slice(0, 8);
        return (
          <Badge key={id} variant="secondary" className="gap-1">
            {label}
            <button
              type="button"
              onClick={() => toggle.mutate({ taskId, userId: id, on: false })}
              className="rounded-full p-0.5 hover:bg-destructive/20"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
      {eligible.length > 0 && (
        <Select onValueChange={(v) => toggle.mutate({ taskId, userId: v, on: true })}>
          <SelectTrigger asChild>
            <Button variant="ghost" size="sm">
              <Plus className="h-3 w-3" /> Watch
            </Button>
          </SelectTrigger>
          <SelectContent>
            {eligible.map((m) => (
              <SelectItem key={m.userId} value={m.userId}>{m.displayName ?? m.email}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
