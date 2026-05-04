import type { VibeOpsApi } from '../preload/api';

declare global {
  interface Window {
    vibeops: VibeOpsApi;
  }
}

export {};
