import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatComposer } from './ChatComposer';
import { ChatTranscript } from './ChatTranscript';
import { useEnsureProjectSession, useChatHistory, useSendChat } from './useChat';
import { useSelectedProjectId } from '@/features/projects/selectedProject';
import { EmptyState } from '@/components/EmptyState';
import { MessageSquare } from 'lucide-react';

export function DashboardChatPreview() {
  const selectedId = useSelectedProjectId();
  const { data: session } = useEnsureProjectSession(selectedId ?? undefined);
  const { data: history = [] } = useChatHistory(session?.id);
  const send = useSendChat(session?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Chat</CardTitle>
        <CardDescription>{selectedId ? 'Ask about the selected project.' : 'Select a project to start.'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!selectedId ? (
          <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No project selected" />
        ) : (
          <>
            <div className="max-h-[260px] overflow-y-auto pr-1">
              <ChatTranscript messages={history.slice(-4)} />
            </div>
            <ChatComposer
              disabled={!session || send.isPending}
              onSend={(t) => send.mutate(t)}
            />
            {send.isError && (
              <div className="text-xs text-destructive">{(send.error as Error).message}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
