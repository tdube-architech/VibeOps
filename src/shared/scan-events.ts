export type ScanProgressStage =
  | 'walking'
  | 'classifying'
  | 'detecting'
  | 'persisting'
  | 'summarizing'
  | 'completed'
  | 'failed';

export interface ScanProgressEvent {
  scanId: string;
  projectId: string;
  stage: ScanProgressStage;
  filesSeen: number;
  filesPersisted: number;
  bytesSeen: number;
  message?: string;
  errorMessage?: string;
}
