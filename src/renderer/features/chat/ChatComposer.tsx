import { useState } from 'react';
import { Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function ChatComposer({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [text, setText] = useState('');
  function submit() {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }
  return (
    <div className="flex gap-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Explain what this app does and how it's structured…"
        className="min-h-[44px] resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
        }}
        disabled={disabled}
      />
      <Button onClick={submit} disabled={disabled}><Send className="h-4 w-4" /> Send</Button>
    </div>
  );
}
