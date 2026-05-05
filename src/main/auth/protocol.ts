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

export function setupProtocolHandler(deps: ProtocolDeps): void {
  registerScheme();

  app.on('second-instance', (_event, argv) => {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
    const url = extractDeepLinkFromArgv(argv);
    if (url) deps.onDeepLink(url);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (url.startsWith(`${PROTOCOL}://`)) deps.onDeepLink(url);
  });

  const initial = extractDeepLinkFromArgv(process.argv.slice(1));
  if (initial) {
    setTimeout(() => deps.onDeepLink(initial), 1500);
  }
}
