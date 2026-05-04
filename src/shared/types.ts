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
