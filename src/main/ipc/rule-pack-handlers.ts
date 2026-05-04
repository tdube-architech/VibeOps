import { ipcMain } from 'electron';
import type { Logger } from 'pino';
import { IpcChannels } from '@shared/ipc-channels';
import type { RulePackManifest, RulePackUpdateState } from '@shared/rule-pack';
import { loadActiveRulePack, rulePackInfo } from '@main/audit/rule-pack/loader';
import { checkForRulePackUpdate, readUpdaterState, type UpdateResult } from '@main/audit/rule-pack/updater';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export interface RulePackContext {
  appDataRoot: string;
  logger: Logger;
}

export function registerRulePackHandlers(ctx: RulePackContext): void {
  ipcMain.handle(IpcChannels.rulePackInfo, (): Result<RulePackManifest | null> => {
    try {
      const pack = loadActiveRulePack({ appDataRoot: ctx.appDataRoot, logger: ctx.logger });
      return ok(rulePackInfo(pack));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.rulePackCheckUpdate, async (): Promise<Result<UpdateResult>> => {
    try {
      const result = await checkForRulePackUpdate({ appDataRoot: ctx.appDataRoot, logger: ctx.logger });
      return ok(result);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.rulePackState, (): Result<RulePackUpdateState> => {
    try {
      const persisted = readUpdaterState(ctx.appDataRoot);
      const pack = loadActiveRulePack({ appDataRoot: ctx.appDataRoot, logger: ctx.logger });
      return ok({
        manifest: rulePackInfo(pack),
        lastCheckedAt: persisted.lastCheckedAt,
        lastError: persisted.lastError
      });
    } catch (e) { return fail(e); }
  });
}
