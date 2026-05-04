import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { AuditRun, AuditFinding, GeneratedPrompt, AuditType } from '@shared/types';
import { runAudit } from '@main/audit';
import type { AuditsRepo } from '@main/audit/repo';
import type { ScansRepo } from '@main/scanner/repo';
import type { ProjectsService } from '@main/projects/service';
import type { ProviderRegistry } from '@main/ai/registry';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export interface AuditContext {
  auditsRepo: AuditsRepo;
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  registry: ProviderRegistry;
  logger: Logger;
  appDataRoot: string;
}

export function registerAuditHandlers(ctx: AuditContext): void {
  ipcMain.handle(IpcChannels.auditStart,
    async (_e, payload: { projectId: string; auditType?: AuditType }): Promise<Result<AuditRun>> => {
      try {
        const args: { projectId: string; auditType?: AuditType } = { projectId: payload.projectId };
        if (payload.auditType) args.auditType = payload.auditType;
        return ok(await runAudit({
          auditsRepo: ctx.auditsRepo,
          scansRepo: ctx.scansRepo,
          projectsService: ctx.projectsService,
          registry: ctx.registry,
          logger: ctx.logger,
          appDataRoot: ctx.appDataRoot
        }, args));
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.auditList, (_e, projectId: string): Result<AuditRun[]> => {
    try { return ok(ctx.auditsRepo.listByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditGet, (_e, auditId: string): Result<AuditRun | null> => {
    try { return ok(ctx.auditsRepo.byId(auditId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditLatest, (_e, projectId: string): Result<AuditRun | null> => {
    try { return ok(ctx.auditsRepo.latestForProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditFindings, (_e, auditRunId: string): Result<AuditFinding[]> => {
    try { return ok(ctx.auditsRepo.findingsByRun(auditRunId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.auditUpdateFinding,
    (_e, payload: { id: string; status: AuditFinding['status'] }): Result<AuditFinding | null> => {
      try { return ok(ctx.auditsRepo.updateFindingStatus(payload.id, payload.status)); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.promptList, (_e, projectId: string): Result<GeneratedPrompt[]> => {
    try { return ok(ctx.auditsRepo.promptsByProject(projectId)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.promptGet, (_e, id: string): Result<GeneratedPrompt | null> => {
    try { return ok(ctx.auditsRepo.promptById(id)); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.promptUpdate,
    (_e, payload: { id: string; status?: GeneratedPrompt['status']; outcomeNotes?: string | null; usedAt?: string | null }): Result<GeneratedPrompt | null> => {
      try {
        const patch: Record<string, unknown> = {};
        if (payload.status !== undefined) patch.status = payload.status;
        if (payload.outcomeNotes !== undefined) patch.outcomeNotes = payload.outcomeNotes;
        if (payload.usedAt !== undefined) patch.usedAt = payload.usedAt;
        return ok(ctx.auditsRepo.updatePrompt(payload.id, patch as never));
      } catch (e) { return fail(e); }
    }
  );
}
