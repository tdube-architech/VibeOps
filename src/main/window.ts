import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMainWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay().workAreaSize;
  const targetWidth = Math.min(Math.max(1440, Math.round(display.width * 0.9)), display.width);
  const targetHeight = Math.min(Math.max(900, Math.round(display.height * 0.9)), display.height);

  const win = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#0a0a0b',
    show: false,
    autoHideMenuBar: true,
    title: 'VibeOps',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (!devUrl || !url.startsWith(devUrl)) e.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
