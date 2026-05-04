import { app, BrowserWindow, session } from 'electron';
import { createMainWindow } from './window';
import { registerCoreHandlers, registerProjectsHandlers, registerScannerHandlers } from './ipc/handlers';
import { resolveAppPaths } from './db/paths';
import { openDb } from './db/client';
import { runMigrations } from './db/migrate';
import { getLogger } from './logger';
import { ProjectsRepo } from './projects/repo';
import { ProjectsService } from './projects/service';
import { ScansRepo } from './scanner/repo';

let mainWindow: BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  await app.whenReady();

  const paths = resolveAppPaths();
  const log = getLogger(paths.logsDir);
  log.info({ root: paths.root }, 'app data root resolved');

  const handle = openDb(paths.dbFile);
  runMigrations(handle);
  log.info('database migrated');

  const projectsRepo = new ProjectsRepo(handle.db);
  const projectsService = new ProjectsService(projectsRepo);
  const scansRepo = new ScansRepo(handle.db);

  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws://localhost:5173 http://localhost:5173"
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

  mainWindow = createMainWindow();

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
