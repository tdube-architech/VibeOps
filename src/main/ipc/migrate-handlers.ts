import { ipcMain } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { Project } from '@shared/types';
import type { ProjectsService } from '@main/projects/service';
import { readMigrationMap, recordMigration, recordSkip } from '@main/migrate/store';

interface IpcError { code: string; message: string }
type Result<T> = { ok: true; value: T } | { ok: false; error: IpcError };
const ok = <T,>(v: T): Result<T> => ({ ok: true, value: v });
const fail = (e: unknown): Result<never> => ({
  ok: false, error: { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) }
});

export interface MigrateStatusPayload {
  unmigrated: Project[];
  alreadyMigrated: number;
  skippedAt: string | null;
}

export interface MigrateContext {
  appDataRoot: string;
  projectsService: ProjectsService;
}

export function registerMigrateHandlers(ctx: MigrateContext): void {
  ipcMain.handle(IpcChannels.migrateStatus, (): Result<MigrateStatusPayload> => {
    try {
      const map = readMigrationMap(ctx.appDataRoot);
      const all = ctx.projectsService.list({ includeArchived: true });
      const migratedSet = new Set(Object.keys(map.mappings));
      // Only legacy local ids (prj_xxx) are migration candidates.
      // UUID-shaped ids are stubs mirroring cloud projects, created by upsertStub
      // during scan/audit; they must never appear as "local-only" candidates.
      const isLegacyLocalId = (id: string) => /^prj_[a-z0-9]+$/i.test(id);
      const unmigrated = all
        .filter((p) => isLegacyLocalId(p.id))
        .filter((p) => !migratedSet.has(p.id));
      const alreadyMigrated = Object.keys(map.mappings).length;
      return ok({ unmigrated, alreadyMigrated, skippedAt: map.skippedAt });
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.migrateMark,
    (_e, payload: { localId: string; serverId: string }): Result<true> => {
      try {
        recordMigration(ctx.appDataRoot, payload.localId, payload.serverId);
        return ok(true);
      } catch (e) { return fail(e); }
    }
  );

  ipcMain.handle(IpcChannels.migrateSkip, (): Result<true> => {
    try { recordSkip(ctx.appDataRoot); return ok(true); } catch (e) { return fail(e); }
  });
}
