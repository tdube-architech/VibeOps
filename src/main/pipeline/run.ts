import type { Logger } from 'pino';
import type { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { runScan } from '@main/scanner';
import { ProgressEmitter } from '@main/scanner/progress';
import { runAudit } from '@main/audit';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { AuditsRepo } from '@main/audit/repo';
import type { MemoryService } from '@main/memory/service';
import type { ProviderRegistry } from '@main/ai/registry';

export type PipelineStage =
  | 'queued'
  | 'git-refresh'
  | 'scanning'
  | 'memory-generating'
  | 'memory-writing'
  | 'auditing'
  | 'completed'
  | 'failed';

export interface PipelineEvent {
  projectId: string;
  stage: PipelineStage;
  message?: string;
  errorMessage?: string;
  gitRefresh?: import('@shared/pipeline-events').GitRefreshPayload;
}

export interface PipelineDeps {
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  auditsRepo: AuditsRepo;
  memoryService: MemoryService;
  registry: ProviderRegistry;
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
  appDataRoot: string;
}

function emit(deps: PipelineDeps, event: PipelineEvent): void {
  const win = deps.getMainWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send(IpcChannels.pipelineProgress, event);
}

export interface AutoPipelineOpts {
  generateMemory?: boolean;
  writeMemoryFile?: boolean;
  runAudit?: boolean;
}

export async function runAutoPipeline(
  deps: PipelineDeps,
  args: { projectId: string } & AutoPipelineOpts
): Promise<void> {
  const { projectId } = args;
  const opts: Required<AutoPipelineOpts> = {
    generateMemory: args.generateMemory ?? true,
    writeMemoryFile: args.writeMemoryFile ?? false,
    runAudit: args.runAudit ?? true
  };

  emit(deps, { projectId, stage: 'queued', message: 'Starting auto-pipeline…' });

  try {
    // 1. Scan
    emit(deps, { projectId, stage: 'scanning', message: 'Scanning project…' });
    const emitter = new ProgressEmitter('', projectId, deps.getMainWindow);
    await runScan(
      { scansRepo: deps.scansRepo, projectsService: deps.projectsService, logger: deps.logger },
      { projectId, emitter }
    );

    // 2. Memory generation (and optional file write)
    if (opts.generateMemory) {
      emit(deps, { projectId, stage: 'memory-generating', message: 'Generating memory.md draft…' });
      const draft = await deps.memoryService.generateDraft(projectId, { mode: 'merge-with-disk' });
      const saved = deps.memoryService.saveDraft(projectId, draft.content, 'generated');

      if (opts.writeMemoryFile) {
        emit(deps, { projectId, stage: 'memory-writing', message: 'Writing memory.md to project root…' });
        await deps.memoryService.writeFile({ projectId, memoryId: saved.id });
      }
    }

    // 3. Audit
    if (opts.runAudit) {
      emit(deps, { projectId, stage: 'auditing', message: 'Running audit…' });
      await runAudit(
        {
          auditsRepo: deps.auditsRepo,
          scansRepo: deps.scansRepo,
          projectsService: deps.projectsService,
          registry: deps.registry,
          logger: deps.logger,
          appDataRoot: deps.appDataRoot
        },
        { projectId }
      );
    }

    emit(deps, { projectId, stage: 'completed', message: 'Auto-pipeline complete.' });
    deps.logger.info({ projectId }, 'auto-pipeline complete');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(deps, { projectId, stage: 'failed', errorMessage: message });
    deps.logger.error({ projectId, err: message }, 'auto-pipeline failed');
  }
}
