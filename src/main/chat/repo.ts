import { asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { aiSessions, aiMessages, type AiSessionRow, type AiMessageRow } from '@main/db/schema';
import type { ChatSession, ChatMessage, ChatRole } from '@shared/types';

function toSession(r: AiSessionRow): ChatSession {
  return {
    id: r.id, projectId: r.projectId, workspaceId: r.workspaceId,
    provider: r.provider, model: r.model,
    purpose: r.purpose as ChatSession['purpose'],
    title: r.title, createdAt: r.createdAt
  };
}

function toMessage(r: AiMessageRow): ChatMessage {
  return {
    id: r.id, sessionId: r.sessionId, role: r.role as ChatRole,
    content: r.content, inputTokens: r.inputTokens, outputTokens: r.outputTokens,
    createdAt: r.createdAt
  };
}

export class ChatRepo {
  constructor(private readonly db: Db) {}

  createSession(args: Omit<ChatSession, 'createdAt'> & { createdAt?: string }): ChatSession {
    const createdAt = args.createdAt ?? new Date().toISOString();
    this.db.insert(aiSessions).values({
      id: args.id,
      projectId: args.projectId,
      workspaceId: args.workspaceId,
      provider: args.provider,
      model: args.model,
      purpose: args.purpose,
      title: args.title,
      createdAt
    }).run();
    return this.session(args.id)!;
  }

  session(id: string): ChatSession | null {
    const row = this.db.select().from(aiSessions).where(eq(aiSessions.id, id)).get();
    return row ? toSession(row) : null;
  }

  sessionsForProject(projectId: string): ChatSession[] {
    return this.db.select().from(aiSessions).where(eq(aiSessions.projectId, projectId))
      .orderBy(desc(aiSessions.createdAt)).all().map(toSession);
  }

  insertMessage(m: Omit<ChatMessage, 'createdAt'> & { createdAt?: string }): ChatMessage {
    const createdAt = m.createdAt ?? new Date().toISOString();
    this.db.insert(aiMessages).values({
      id: m.id,
      sessionId: m.sessionId,
      role: m.role,
      content: m.content,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      createdAt
    }).run();
    const row = this.db.select().from(aiMessages).where(eq(aiMessages.id, m.id)).get();
    return toMessage(row!);
  }

  messages(sessionId: string): ChatMessage[] {
    return this.db.select().from(aiMessages).where(eq(aiMessages.sessionId, sessionId))
      .orderBy(asc(aiMessages.createdAt)).all().map(toMessage);
  }
}
