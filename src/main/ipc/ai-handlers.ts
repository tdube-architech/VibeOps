import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { AIProviderId } from '@shared/types';
import type { AITestConnectionResult, ProjectAnalysisResult } from '@shared/ai';
import type { ProviderRegistry } from '@main/ai/registry';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import { generateProjectSummary } from '@main/ai/operations/project-summary';

export interface AIContext {
  registry: ProviderRegistry;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  logger: Logger;
}

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerAIHandlers(ctx: AIContext): void {
  ipcMain.handle(IpcChannels.aiTestConnection, async (_e, providerId: AIProviderId): Promise<Result<AITestConnectionResult>> => {
    try {
      const provider = ctx.registry.buildById(providerId);
      return ok(await provider.testConnection({}));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.aiGenerateProjectSummary, async (_e, projectId: string): Promise<Result<ProjectAnalysisResult>> => {
    try {
      const provider = ctx.registry.buildActive();
      const result = await generateProjectSummary({
        provider, projectsService: ctx.projectsService, scansRepo: ctx.scansRepo
      }, { projectId });
      ctx.logger.info({ projectId, redactions: result.trace.redactionsApplied }, 'project summary generated');
      return ok(result);
    } catch (e) { return fail(e); }
  });
}
