import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { ChatMessage, ChatSession } from '@shared/types';
import type { ChatService } from '@main/chat/service';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerChatHandlers(svc: ChatService, _logger: Logger): void {
  ipcMain.handle(IpcChannels.chatEnsureProjectSession, (_e, projectId: string): Result<ChatSession> => {
    try { return ok(svc.ensureProjectSession(projectId)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.chatHistory, (_e, sessionId: string): Result<ChatMessage[]> => {
    try { return ok(svc.history(sessionId)); } catch (e) { return fail(e); }
  });
  ipcMain.handle(IpcChannels.chatSend,
    async (_e, payload: { sessionId: string; userText: string }): Promise<Result<{ user: ChatMessage; assistant: ChatMessage }>> => {
      try { return ok(await svc.send(payload)); } catch (e) { return fail(e); }
    }
  );
}
