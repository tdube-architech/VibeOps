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
