import { contextBridge } from 'electron';
import { api } from './api';

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('vibeops', api);
} else {
  // Dev fallback only — should never run in production with sandbox+isolation on.
  // @ts-expect-error window typing
  window.vibeops = api;
}
