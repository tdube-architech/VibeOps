import { ipcMain } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { IpcChannels } from '@shared/ipc-channels';
import type { DiffWatcherService } from '@main/ai-session/diff-watcher';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown, code = 'INTERNAL'): Result<never> => ({
  ok: false, error: { code, message: e instanceof Error ? e.message : String(e) }
});

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 10_000;

async function gitHeadSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd, timeout: GIT_TIMEOUT_MS });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function isInsideCwd(cwd: string, filePath: string): boolean {
  const abs = path.resolve(cwd, filePath);
  const rel = path.relative(cwd, abs);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function registerAiSessionHandlers(svc: DiffWatcherService): void {
  ipcMain.handle(IpcChannels.aiSessionStartWatch,
    async (_e, payload: { clientLocalId: string; cwd: string }): Promise<Result<{ sha: string | null }>> => {
      try {
        await svc.start(payload.clientLocalId, payload.cwd);
        const sha = await gitHeadSha(payload.cwd);
        return ok({ sha });
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.aiSessionStopWatch,
    (_e, clientLocalId: string): Result<true> => {
      try { svc.stop(clientLocalId); return ok(true); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.aiSessionGitHead,
    async (_e, cwd: string): Promise<Result<{ sha: string | null }>> => {
      try { return ok({ sha: await gitHeadSha(cwd) }); }
      catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.aiSessionRevertFile,
    async (_e, payload: {
      cwd: string;
      filePath: string;
      diffKind: 'create' | 'modify' | 'delete';
      sha: string | null;
    }): Promise<Result<true>> => {
      try {
        if (!isInsideCwd(payload.cwd, payload.filePath)) {
          return fail(new Error('Refusing to revert path outside the project'), 'BAD_PATH');
        }
        const abs = path.resolve(payload.cwd, payload.filePath);

        if (payload.diffKind === 'create') {
          await unlink(abs).catch((err: NodeJS.ErrnoException) => {
            if (err.code !== 'ENOENT') throw err;
          });
          return ok(true);
        }

        if (!payload.sha) {
          return fail(
            new Error('Cannot revert: this session was not started in a git repo, so the original content is unrecoverable.'),
            'NO_GIT'
          );
        }
        await run('git', ['checkout', payload.sha, '--', payload.filePath], {
          cwd: payload.cwd,
          timeout: GIT_TIMEOUT_MS
        });
        return ok(true);
      } catch (e) {
        return fail(e);
      }
    }
  );
}
