import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ChatMessage } from '@shared/types';

const sessionKey = (projectId: string) => ['chat', projectId, 'session'] as const;
const historyKey = (sessionId: string) => ['chat', sessionId, 'history'] as const;

export function useEnsureProjectSession(projectId: string | undefined) {
  return useQuery({
    queryKey: projectId ? sessionKey(projectId) : ['chat', '__none__'],
    queryFn: () => (projectId ? api.chat.ensureProjectSession(projectId) : Promise.resolve(null)),
    enabled: !!projectId
  });
}

export function useChatHistory(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionId ? historyKey(sessionId) : ['chat', '__none__', 'history'],
    queryFn: () => (sessionId ? api.chat.history(sessionId) : Promise.resolve<ChatMessage[]>([])),
    enabled: !!sessionId
  });
}

export function useSendChat(sessionId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userText: string) => {
      if (!sessionId) throw new Error('No active chat session.');
      return api.chat.send(sessionId, userText);
    },
    onSuccess: () => {
      if (sessionId) qc.invalidateQueries({ queryKey: historyKey(sessionId) });
    }
  });
}
