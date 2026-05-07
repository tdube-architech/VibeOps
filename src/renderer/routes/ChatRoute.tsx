import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatTranscript } from '@/features/chat/ChatTranscript';
import { useEnsureProjectSession, useChatHistory, useSendChat } from '@/features/chat/useChat';
import { useProjectList } from '@/features/projects/useProjects';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ChatRoute() {
  const { data: projects = [] } = useProjectList();
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const { data: session } = useEnsureProjectSession(projectId);
  const { data: history = [] } = useChatHistory(session?.id);
  const send = useSendChat(session?.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-h1">AI Chat</h1>
        <p className="text-sm text-muted-foreground">Project-scoped chat. Source code is not sent — only memory.md, scan summary, and file paths.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project</CardTitle>
          <CardDescription>Pick a project to chat about.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={projectId ?? ''} onValueChange={setProjectId}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Select a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="max-h-[480px] overflow-y-auto pr-1">
            <ChatTranscript messages={history} />
          </div>
          <ChatComposer disabled={!session || send.isPending} onSend={(t) => send.mutate(t)} />
          {send.isError && <div className="text-sm text-destructive">{(send.error as Error).message}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
