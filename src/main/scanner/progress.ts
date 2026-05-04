import { BrowserWindow } from 'electron';
import { IpcChannels } from '@shared/ipc-channels';
import type { ScanProgressEvent, ScanProgressStage } from '@shared/scan-events';

export class ProgressEmitter {
  private filesSeen = 0;
  private filesPersisted = 0;
  private bytesSeen = 0;

  constructor(
    private scanId: string,
    private readonly projectId: string,
    private readonly getWindow: () => BrowserWindow | null
  ) {}

  setScanId(id: string): void {
    this.scanId = id;
  }

  send(stage: ScanProgressStage, message?: string, errorMessage?: string): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    const event: ScanProgressEvent = {
      scanId: this.scanId,
      projectId: this.projectId,
      stage,
      filesSeen: this.filesSeen,
      filesPersisted: this.filesPersisted,
      bytesSeen: this.bytesSeen
    };
    if (message !== undefined) event.message = message;
    if (errorMessage !== undefined) event.errorMessage = errorMessage;
    win.webContents.send(IpcChannels.scanProgress, event);
  }

  bump(filesSeen: number, bytesSeen: number): void {
    this.filesSeen = filesSeen;
    this.bytesSeen = bytesSeen;
  }

  bumpPersisted(persisted: number): void {
    this.filesPersisted = persisted;
  }
}
