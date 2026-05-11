export type PipelineStage =
  | 'queued'
  | 'git-refresh'
  | 'scanning'
  | 'memory-generating'
  | 'memory-writing'
  | 'auditing'
  | 'completed'
  | 'failed';

export interface GitRefreshPayload {
  attempted: boolean;
  fetched: boolean;
  pulled: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
}

export interface PipelineEvent {
  projectId: string;
  stage: PipelineStage;
  message?: string;
  errorMessage?: string;
  gitRefresh?: GitRefreshPayload;
}

export interface AutoPipelineOpts {
  generateMemory?: boolean;
  writeMemoryFile?: boolean;
  runAudit?: boolean;
}
