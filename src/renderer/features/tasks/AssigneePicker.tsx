import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTaskMembers } from './useTaskMembers';

export function AssigneePicker({
  value, onChange
}: { value: string | null; onChange: (userId: string | null) => void }) {
  const { data: members = [] } = useTaskMembers();
  return (
    <Select value={value ?? '__unassigned'} onValueChange={(v) => onChange(v === '__unassigned' ? null : v)}>
      <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Unassigned" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__unassigned">Unassigned</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>{m.displayName ?? m.email}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
