export type PipelineStage =
  | 'queued'
  | 'scanning'
  | 'memory-generating'
  | 'memory-writing'
  | 'auditing'
  | 'completed'
  | 'failed';

export interface PipelineEvent {
  projectId: string;
  stage: PipelineStage;
  message?: string;
  errorMessage?: string;
}

export interface AutoPipelineOpts {
  generateMemory?: boolean;
  writeMemoryFile?: boolean;
  runAudit?: boolean;
}
