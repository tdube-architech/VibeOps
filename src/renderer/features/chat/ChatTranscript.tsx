import type { ChatMessage } from '@shared/types';
import { cn } from '@/lib/utils';

export function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <div className="text-sm text-muted-foreground">Ask something about this project.</div>;
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div key={m.id} className={cn(
          'rounded-md border border-border px-3 py-2 text-sm',
          m.role === 'user' ? 'bg-primary/10 border-primary/40' : 'bg-card/40'
        )}>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {m.role}{m.outputTokens !== null ? ` · ${m.outputTokens}t` : ''}
          </div>
          <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
        </div>
      ))}
    </div>
  );
}
