import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { customAlphabet } from 'nanoid';
import { createMainWindow } from './window';
import {
  registerCoreHandlers,
  registerProjectsHandlers,
  registerScannerHandlers,
  registerMemoryHandlers,
  registerSettingsHandlers,
  registerAIHandlers,
  registerAuditHandlers,
  registerDataHandlers,
  registerUpdateHandlers,
  registerWorkspaceHandlers,
  registerChatHandlers,
  registerTaskHandlers,
  registerPipelineHandlers,
  registerRulePackHandlers,
  registerAuthHandlers,
  registerMigrateHandlers,
  registerTerminalHandlers,
  registerAiSessionHandlers
} from './ipc/handlers';
import { AuthService } from './auth/service';
import { setupProtocolHandler } from './auth/protocol';
import { TerminalService } from './terminal/service';
import { DiffWatcherService } from './ai-session/diff-watcher';
import { resolveAppPaths } from './db/paths';
import { openDb } from './db/client';
import { runMigrations } from './db/migrate';
import { getLogger } from './logger';
import { ProjectsRepo } from './projects/repo';
import { ProjectsService } from './projects/service';
import { ScansRepo } from './scanner/repo';
import { MemoriesRepo } from './memory/repo';
import { MemoryService } from './memory/service';
import { SettingsService } from './settings/service';
import { getSecretStore } from './settings/safe-storage';
import { ProviderRegistry } from './ai/registry';
import { AuditsRepo } from './audit/repo';
import { BackupService } from './backup/service';
import { setupUpdater, updaterApi } from './update/updater';
import { startRulePackUpdateScheduler } from './audit/rule-pack/updater';
import { WorkspacesRepo } from './workspaces/repo';
import { WorkspacesService } from './workspaces/service';
import { ChatRepo } from './chat/repo';
import { ChatService } from './chat/service';
import { TasksRepo } from './tasks/repo';
import { TasksService } from './tasks/service';

let mainWindow: BrowserWindow | null = null;

const SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock();
if (!SINGLE_INSTANCE_LOCK) {
  app.exit(0);
}

async function bootstrap(): Promise<void> {
  if (!SINGLE_INSTANCE_LOCK) return;
  await app.whenReady();

  const paths = resolveAppPaths();
  const log = getLogger(paths.logsDir);
  log.info({ root: paths.root }, 'app data root resolved');

  const supabaseUrl = (import.meta.env.MAIN_VITE_SUPABASE_URL as string | undefined)
    ?? process.env.MAIN_VITE_SUPABASE_URL ?? '';
  log.info({ supabaseConfigured: Boolean(supabaseUrl) }, 'auth bootstrap');
  const auth = new AuthService({
    appDataRoot: paths.root,
    supabaseUrl,
    logger: log,
    getMainWindow: () => mainWindow
  });
  setupProtocolHandler({
    logger: log,
    getMainWindow: () => mainWindow,
    onDeepLink: (url) => {
      log.info({ url }, 'deep link received');
      auth.forwardDeepLink(url);
    }
  });

  const handle = openDb(paths.dbFile);
  runMigrations(handle);
  log.info('database migrated');

  const projectsRepo = new ProjectsRepo(handle.db);
  const projectsService = new ProjectsService(projectsRepo);
  const scansRepo = new ScansRepo(handle.db);
  const memoriesRepo = new MemoriesRepo(handle.db);
  const memoryIdGen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
  const memoryService = new MemoryService({
    memoriesRepo, projectsService, scansRepo,
    newId: () => `m_${memoryIdGen()}`
  });
  const settingsService = new SettingsService({
    settingsPath: path.join(paths.root, 'settings.json'),
    secretsPath: path.join(paths.root, 'secrets.json'),
    secretStore: getSecretStore()
  });
  const aiRegistry = new ProviderRegistry(settingsService);
  const auditsRepo = new AuditsRepo(handle.db);
  const backup = new BackupService({ dbFile: paths.dbFile });
  const workspacesRepo = new WorkspacesRepo(handle.db);
  const workspacesService = new WorkspacesService(workspacesRepo);
  const chatRepo = new ChatRepo(handle.db);
  const chatService = new ChatService({
    chatRepo, registry: aiRegistry,
    projectsService, scansRepo, memoryService,
    logger: log
  });
  const tasksRepo = new TasksRepo(handle.db);
  const tasksService = new TasksService(tasksRepo, auditsRepo);

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co https://avatars.githubusercontent.com; connect-src 'self' ws://localhost:5173 http://localhost:5173 https://*.supabase.co wss://*.supabase.co"
        ]
      }
    });
  });

  registerCoreHandlers();
  registerProjectsHandlers({ service: projectsService, getMainWindow: () => mainWindow });
  registerScannerHandlers({
    scansRepo,
    projectsService,
    logger: log,
    getMainWindow: () => mainWindow
  });
  registerMemoryHandlers({
    service: memoryService,
    logger: log,
    resolveProjectPath: (id) => projectsService.byId(id)?.localPath ?? null,
    projectsService
  });
  registerSettingsHandlers(settingsService);
  registerAIHandlers({
    registry: aiRegistry,
    projectsService,
    scansRepo,
    logger: log
  });
  registerAuditHandlers({
    auditsRepo, scansRepo, projectsService,
    registry: aiRegistry, logger: log,
    appDataRoot: paths.root
  });
  registerDataHandlers({
    backup, db: handle.db, dbHandle: handle,
    appDataRoot: paths.root, logsDir: paths.logsDir,
    logger: log, getMainWindow: () => mainWindow,
    projectsService, auditsRepo
  });
  registerUpdateHandlers(updaterApi);
  registerWorkspaceHandlers(workspacesService, settingsService);
  registerChatHandlers(chatService, log);
  registerTaskHandlers(tasksService);
  registerPipelineHandlers({
    projectsService,
    scansRepo,
    auditsRepo,
    memoryService,
    registry: aiRegistry,
    logger: log,
    getMainWindow: () => mainWindow,
    appDataRoot: paths.root
  });
  registerRulePackHandlers({ appDataRoot: paths.root, logger: log });
  registerAuthHandlers(auth);
  registerMigrateHandlers({ appDataRoot: paths.root, projectsService });

  const terminalService = new TerminalService({ logger: log, getMainWindow: () => mainWindow });
  registerTerminalHandlers(terminalService);
  const diffWatcher = new DiffWatcherService({ logger: log, getMainWindow: () => mainWindow });
  registerAiSessionHandlers(diffWatcher);
  app.on('before-quit', () => {
    terminalService.killAll();
    diffWatcher.stopAll();
  });

  mainWindow = createMainWindow();
  setupUpdater({ logger: log, getMainWindow: () => mainWindow });

  startRulePackUpdateScheduler({
    appDataRoot: paths.root,
    logger: log,
    onResult: (result) => {
      const win = mainWindow;
      if (!win || win.isDestroyed()) return;
      if (result.status === 'updated' || result.status === 'error') {
        win.webContents.send('rulePack:state', result);
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      handle.close();
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

bootstrap().catch((err) => {
  console.error('bootstrap failed', err);
  app.exit(1);
});
