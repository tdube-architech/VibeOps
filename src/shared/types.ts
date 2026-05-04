export type ProjectStatus = 'active' | 'planning' | 'needs_cleanup' | 'critical' | 'archived';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  localPath: string;
  repoUrl: string | null;
  category: string | null;
  status: ProjectStatus;
  primaryStack: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastScannedAt: string | null;
  lastAuditedAt: string | null;
}

export interface AppInfo {
  version: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}

export interface ProjectInput {
  name: string;
  localPath: string;
  description?: string;
  category?: string;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string;
}

export interface ProjectPatch {
  id: string;
  name?: string;
  description?: string | null;
  category?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string | null;
}

export interface FolderPickResult {
  canceled: boolean;
  path: string | null;
}

export type ProjectListSort = 'recent' | 'name' | 'lastScanned';

export interface ProjectListQuery {
  search?: string;
  status?: ProjectStatus | 'all';
  sort?: ProjectListSort;
  includeArchived?: boolean;
}

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type FileType =
  | 'source'
  | 'config'
  | 'doc'
  | 'lock'
  | 'env-example'
  | 'env-secret'
  | 'binary'
  | 'asset'
  | 'test'
  | 'unknown';

export interface DetectionResult {
  projectType: string | null;
  packageManager: string | null;
  frameworks: string[];
  database: string | null;
  auth: string | null;
  deployment: string | null;
  primaryStack: string | null;
}

export interface ScanWarning {
  code: string;
  message: string;
  filePath?: string;
}

export interface Scan {
  id: string;
  projectId: string;
  status: ScanStatus;
  summary: string | null;
  detection: DetectionResult;
  warnings: ScanWarning[];
  fileCount: number;
  byteCount: number;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ScanFile {
  id: string;
  projectId: string;
  scanId: string;
  path: string;
  fileType: FileType;
  sizeBytes: number;
  hash: string | null;
  importanceScore: number;
  summary: string | null;
  lastSeenAt: string;
}

export interface ScanEnvVar {
  id: string;
  projectId: string;
  scanId: string;
  filename: string;
  variable: string;
  required: boolean;
  comment: string | null;
}
