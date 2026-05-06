import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import type { Logger } from 'pino';

const PROTOCOL = 'vibeops';

export interface ProtocolDeps {
  logger: Logger;
  getMainWindow: () => BrowserWindow | null;
  onDeepLink: (url: string) => void;
}

function registerScheme(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1] ?? '.')]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function extractDeepLinkFromArgv(argv: readonly string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith(`${PROTOCOL}://`)) return arg;
  }
  return null;
}

function waitForRenderer(getWin: () => BrowserWindow | null): Promise<BrowserWindow> {
  return new Promise((resolve) => {
    const tryNow = () => {
      const win = getWin();
      if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
        resolve(win);
        return true;
      }
      return false;
    };
    if (tryNow()) return;
    const interval = setInterval(() => {
      const win = getWin();
      if (!win || win.isDestroyed()) return;
      win.webContents.once('did-finish-load', () => {
        clearInterval(interval);
        resolve(win);
      });
      if (!win.webContents.isLoading()) {
        clearInterval(interval);
        resolve(win);
      } else {
        clearInterval(interval);
      }
    }, 200);
  });
}

export function setupProtocolHandler(deps: ProtocolDeps): void {
  registerScheme();

  const dispatch = async (url: string): Promise<void> => {
    await waitForRenderer(deps.getMainWindow);
    deps.logger.info({ url }, 'forwarding deep link');
    deps.onDeepLink(url);
  };

  app.on('second-instance', (_event, argv) => {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const url = extractDeepLinkFromArgv(argv);
    if (url) void dispatch(url);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith(`${PROTOCOL}://`)) void dispatch(url);
  });

  const initial = extractDeepLinkFromArgv(process.argv.slice(1));
  if (initial) void dispatch(initial);
}
