import { Textarea } from '@/components/ui/textarea';

export function MemoryEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-[600px] font-mono text-xs leading-relaxed"
      spellCheck={false}
    />
  );
}
