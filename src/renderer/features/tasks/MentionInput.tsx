import { useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useTaskMembers, type TaskMember } from './useTaskMembers';

export function MentionInput({
  value, onChange, onMentionsChange, placeholder
}: {
  value: string;
  onChange: (v: string) => void;
  onMentionsChange?: (userIds: string[]) => void;
  placeholder?: string;
}) {
  const { data: members = [] } = useTaskMembers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart;
    const before = v.slice(0, cursor);
    const handleRe = /@([\w.-]*)$/;
    const m = handleRe.exec(before);
    if (m) {
      setQuery(m[1] ?? '');
      setOpen(true);
    } else {
      setOpen(false);
    }
    if (onMentionsChange) onMentionsChange(collectMentions(v, members));
  }

  function pick(m: TaskMember) {
    if (!ref.current) return;
    const cursor = ref.current.selectionStart;
    const before = value.slice(0, cursor).replace(/@[\w.-]*$/, `@${m.email.split('@')[0]} `);
    const next = before + value.slice(cursor);
    onChange(next);
    setOpen(false);
    if (onMentionsChange) onMentionsChange(collectMentions(next, members));
  }

  const filtered = members.filter((m) => {
    const handle = (m.email.split('@')[0] ?? '').toLowerCase();
    const name = (m.displayName ?? '').toLowerCase();
    return handle.includes(query.toLowerCase()) || name.includes(query.toLowerCase());
  }).slice(0, 6);

  return (
    <div className="relative">
      <Textarea ref={ref} value={value} onChange={onInput} placeholder={placeholder} />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-popover shadow">
          {filtered.map((m) => (
            <li
              key={m.userId}
              className="cursor-pointer px-3 py-1.5 text-sm hover:bg-secondary/40"
              onMouseDown={(e) => { e.preventDefault(); pick(m); }}
            >
              {m.displayName ?? m.email}
              <span className="ml-2 text-xs text-muted-foreground">@{m.email.split('@')[0]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function collectMentions(text: string, members: TaskMember[]): string[] {
  const ids = new Set<string>();
  const handleRe = /@([\w.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = handleRe.exec(text))) {
    const handle = match[1]!.toLowerCase();
    const hit = members.find((x) => (x.email.split('@')[0] ?? '').toLowerCase() === handle);
    if (hit) ids.add(hit.userId);
  }
  return Array.from(ids);
}
