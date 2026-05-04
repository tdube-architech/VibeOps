import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import { runAutoPipeline, type PipelineDeps, type AutoPipelineOpts } from '@main/pipeline/run';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export function registerPipelineHandlers(deps: PipelineDeps): void {
  ipcMain.handle(IpcChannels.pipelineRun,
    async (_e, payload: { projectId: string } & AutoPipelineOpts): Promise<Result<true>> => {
      try {
        // Fire-and-forget; results stream via pipelineProgress events
        void runAutoPipeline(deps, payload);
        return ok(true);
      } catch (e) { return fail(e); }
    }
  );
}
