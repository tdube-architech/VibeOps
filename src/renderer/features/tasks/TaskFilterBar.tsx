import { useTaskMembers } from './useTaskMembers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function TaskFilterBar({
  value, onChange
}: { value: 'all' | 'me' | string; onChange: (v: 'all' | 'me' | string) => void }) {
  const { data: members = [] } = useTaskMembers();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Assignee</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="me">Assigned to me</SelectItem>
          {members.length > 0 && (
            <div className="border-t border-border my-1" />
          )}
          {members.map((m) => (
            <SelectItem key={m.userId} value={m.userId}>
              {m.displayName ?? m.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
