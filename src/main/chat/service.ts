import { customAlphabet } from 'nanoid';
import type { Logger } from 'pino';
import type { ChatMessage, ChatSession, AIProviderId } from '@shared/types';
import type { ProviderRegistry } from '@main/ai/registry';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { MemoryService } from '@main/memory/service';
import type { ChatRepo } from './repo';
import { buildProjectChatContext } from './context';
import { redactSecrets } from '@main/ai/redactor';

const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

export const PROJECT_CHAT_SYSTEM = `You are VibeOps' project assistant. You help the user understand and work on a single software project.
You are given:
- A short scan summary of the project
- The latest memory.md (if present)
- A list of high-importance file paths (paths only)

Rules:
- Reference files and stack from the context — do not invent paths.
- If you do not have enough information to answer, say so and recommend a scan or audit.
- Keep answers under ~250 words unless asked for detail.
- Cite file paths in backticks where relevant.`;

export interface ChatServiceDeps {
  chatRepo: ChatRepo;
  registry: ProviderRegistry;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  memoryService: MemoryService;
  logger: Logger;
}

export class ChatService {
  constructor(private readonly deps: ChatServiceDeps) {}

  ensureProjectSession(projectId: string): ChatSession {
    const existing = this.deps.chatRepo.sessionsForProject(projectId);
    if (existing.length > 0) return existing[0]!;
    const provider = this.deps.registry.buildActive();
    const info = provider.info();
    return this.deps.chatRepo.createSession({
      id: `ses_${newId()}`,
      projectId,
      workspaceId: null,
      provider: info.id,
      model: info.defaultModel,
      purpose: 'project-chat',
      title: null
    });
  }

  history(sessionId: string): ChatMessage[] {
    return this.deps.chatRepo.messages(sessionId);
  }

  async send(args: { sessionId: string; userText: string; signal?: AbortSignal }): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    const session = this.deps.chatRepo.session(args.sessionId);
    if (!session) throw new Error('session not found');

    const userMessage = this.deps.chatRepo.insertMessage({
      id: `msg_${newId()}`,
      sessionId: session.id,
      role: 'user',
      content: args.userText,
      inputTokens: null,
      outputTokens: null
    });

    let contextBlock = '';
    if (session.projectId) {
      const project = this.deps.projectsService.byId(session.projectId);
      if (!project) throw new Error('project missing');
      const scan = this.deps.scansRepo.latestForProject(project.id);
      const files = scan ? this.deps.scansRepo.filesByScan(scan.id) : [];
      const memory = this.deps.memoryService.readFromDisk(project.id) ?? this.deps.memoryService.latest(project.id)?.content ?? null;
      contextBlock = buildProjectChatContext({ project, scan, files, memory });
    }

    const history = this.deps.chatRepo.messages(session.id);
    const transcript = history
      .filter((m) => m.id !== userMessage.id)
      .slice(-8)
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const userPromptRaw = [
      'Project context:',
      contextBlock || '(no project context)',
      '',
      'Conversation so far:',
      transcript || '(none)',
      '',
      `User: ${args.userText}`
    ].join('\n');
    const redacted = redactSecrets(userPromptRaw);

    const provider = this.deps.registry.buildById(session.provider as AIProviderId);
    const completeArgs: { system: string; user: string; signal?: AbortSignal } = {
      system: PROJECT_CHAT_SYSTEM,
      user: redacted.text
    };
    if (args.signal) completeArgs.signal = args.signal;
    const resp = await provider.complete(completeArgs);

    const assistantMessage = this.deps.chatRepo.insertMessage({
      id: `msg_${newId()}`,
      sessionId: session.id,
      role: 'assistant',
      content: resp.text,
      inputTokens: resp.inputTokens,
      outputTokens: resp.outputTokens
    });

    this.deps.logger.info({
      sessionId: session.id,
      redactions: redacted.replaced,
      inTok: resp.inputTokens,
      outTok: resp.outputTokens
    }, 'chat message exchanged');

    return { user: userMessage, assistant: assistantMessage };
  }
}
