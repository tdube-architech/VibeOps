import type {
  AIProviderId, AIModel, AIProviderConfig, AICallTrace
} from './ai';
export type { AIProviderId, AIModel, AIProviderConfig, AICallTrace };

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
  workspaceId: string;
  /** Where this project record currently lives. 'cloud' = synced via Supabase. 'local' = local SQLite only, not yet migrated. */
  source?: 'cloud' | 'local';
  /** Project ACL. Only meaningful for cloud projects. */
  visibility?: 'workspace' | 'private' | 'restricted';
  /** Optimistic concurrency stamp on cloud projects. */
  version?: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInput {
  name: string;
  description?: string;
}

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskStatus = 'backlog' | 'next' | 'in_progress' | 'blocked' | 'done' | 'ignored';

export interface Task {
  id: string;
  projectId: string;
  sourceFindingId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeUserId: string | null;
  relatedFiles: string[];
  suggestedPrompt: string | null;
  createdAt: string;
  completedAt: string | null;
  deletedAt: string | null;
  watcherUserIds?: string[];
  /** Optimistic concurrency stamp. Server-side rows only. Local rows omit. */
  version?: number;
}

export interface TaskInput {
  projectId: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  relatedFiles?: string[];
  suggestedPrompt?: string;
  sourceFindingId?: string;
}

export interface TaskPatch {
  id: string;
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  assigneeUserId?: string | null;
  relatedFiles?: string[];
  suggestedPrompt?: string | null;
}

export interface TaskListQuery {
  projectId?: string;
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  assignee?: 'me' | string;
  trashOnly?: boolean;
}

export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: 'lead' | 'member';
  joinedAt: string;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatSession {
  id: string;
  projectId: string | null;
  workspaceId: string | null;
  provider: string;
  model: string;
  purpose: 'project-chat' | 'general';
  title: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

export interface TerminalSession {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  label: string;
  lineMode: boolean;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

export interface AiSessionDiffEvent {
  clientLocalId: string;
  filePath: string;
  diffKind: 'create' | 'modify' | 'delete';
  beforeHash: string | null;
  afterHash: string | null;
  sizeBytes: number | null;
  ts: string;
}

export interface CloneProgressEvent {
  jobId: string;
  line: string;
  done?: boolean;
  ok?: boolean;
  exitCode?: number | null;
  cwd?: string;
  error?: string;
}

export interface DirtyFileEvent {
  projectId: string;
  filePath: string;
  hash: string | null;
  sizeBytes: number | null;
  modifiedAt: string;
  deleted: boolean;
}

export interface CommitEvent {
  projectId: string;
  sha: string;
  shortSha: string;
  message: string;
  branch: string | null;
  ts: string;
}

export interface AppInfo {
  /** Semver core version, e.g. "0.0.4". */
  version: string;
  /** UTC mmddhhmm of the build, e.g. "05061230". */
  buildTimestamp: string;
  /** Convenience composite, e.g. "0.0.4.05061230". Use this in UI. */
  displayVersion: string;
  electronVersion: string;
  platform: NodeJS.Platform;
}

export interface AuthState {
  status: 'unauthenticated' | 'authenticated';
  user: { id: string; email: string | null } | null;
}

export interface PersistedSession {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user_id: string;
  email: string | null;
}

export interface ProjectInput {
  name: string;
  localPath: string;
  description?: string;
  category?: string;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string;
  workspaceId?: string;
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
  workspaceId?: string;
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

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  dirty: boolean | null;
  aheadBy: number | null;
  behindBy: number | null;
  upstream: string | null;
  lastCommit: GitCommit | null;
  hasGitBinary: boolean;
}

export interface GitCommit {
  sha: string;
  shortSha: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  lastCommit: GitCommit | null;
  upstream: string | null;
}

export interface GitInfo {
  status: GitStatus;
  recentCommits: GitCommit[];
  branches: GitBranch[];
  remotes: Array<{ name: string; url: string }>;
}

export interface DetectionResult {
  projectType: string | null;
  packageManager: string | null;
  frameworks: string[];
  database: string | null;
  auth: string | null;
  deployment: string | null;
  primaryStack: string | null;
  git?: GitStatus;
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

export type MemorySource = 'generated' | 'merged' | 'user-edited' | 'imported';

export interface Memory {
  id: string;
  projectId: string;
  version: number;
  content: string;
  source: MemorySource;
  fileWritten: boolean;
  scanId: string | null;
  createdAt: string;
}

export interface MemoryDraft {
  projectId: string;
  content: string;
  source: MemorySource;
  scanId: string | null;
}

export type MemoryWriteMode = 'create' | 'replace' | 'merge';

export interface MemoryWriteResult {
  memory: Memory;
  filePath: string;
  backupPath: string | null;
}

export interface MemoryFileStatus {
  exists: boolean;
  filePath: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
}

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type FindingCategory =
  | 'architecture'
  | 'security'
  | 'dependency'
  | 'product-completeness'
  | 'vibe-code-quality'
  | 'deployment'
  | 'documentation';
export type AuditStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AuditType = 'full' | 'security-only' | 'dependency-only' | 'architecture-only';
export type RiskLevel = 'Strong' | 'Good' | 'Needs Work' | 'Risky' | 'Critical';

export interface AuditFinding {
  id: string;
  auditRunId: string;
  projectId: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  recommendation: string | null;
  suggestedPrompt: string | null;
  status: 'open' | 'wont-fix' | 'fixed' | 'ignored';
  createdAt: string;
  /** Optimistic concurrency stamp. Server-side rows only. */
  version?: number;
}

export interface AuditRun {
  id: string;
  projectId: string;
  scanId: string | null;
  auditType: AuditType;
  provider: string | null;
  model: string | null;
  status: AuditStatus;
  score: number | null;
  riskLevel: RiskLevel | null;
  summary: string | null;
  recommendedNextAction: string | null;
  generatedPromptId: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  findings: AuditFinding[];
}

export interface GeneratedPrompt {
  id: string;
  projectId: string;
  auditRunId: string | null;
  title: string;
  promptType: string;
  content: string;
  status: 'unused' | 'used' | 'archived';
  outcomeNotes: string | null;
  createdAt: string;
  usedAt: string | null;
}

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  progressPercent: number | null;
  installerPath: string | null;
}

export interface BackupExportResult {
  destination: string;
  bytesCopied: number;
}

export interface DashboardSummary {
  totals: {
    projects: number;
    archived: number;
    needsAudit: number;
    memoryCurrent: number;
    criticalFindings: number;
  };
  highestRiskProject: { id: string; name: string; score: number } | null;
  recentFindings: Array<{
    auditRunId: string;
    projectId: string;
    projectName: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    createdAt: string;
  }>;
}

export interface AppSettings {
  schemaVersion: 1;
  appearance: { theme: 'dark' | 'light' };
  scanner: { extraIgnore: string[] };
  ai: {
    activeProviderId: AIProviderId | null;
    providers: Record<AIProviderId, AIProviderConfig>;
  };
  externalTools: {
    vsCode: string | null;
    cursor: string | null;
    claudeCode: string | null;
    codex: string | null;
    openCode: string | null;
    windowsTerminal: string | null;
    git: string | null;
  };
  security: {
    shellCommandMode: 'disabled' | 'approval' | 'trusted';
    allowAiCloudCalls: boolean;
  };
  workspaces: { activeWorkspaceId: string };
}
