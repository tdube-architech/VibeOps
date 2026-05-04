import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  localPath: text('local_path').notNull().unique(),
  repoUrl: text('repo_url'),
  category: text('category'),
  status: text('status').notNull().default('active'),
  primaryStack: text('primary_stack'),
  tags: text('tags').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updated_at').notNull().default(sql`(CURRENT_TIMESTAMP)`),
  lastScannedAt: text('last_scanned_at'),
  lastAuditedAt: text('last_audited_at'),
  workspaceId: text('workspace_id')
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export type WorkspaceRow = typeof workspaces.$inferSelect;

export const projectScans = sqliteTable('project_scans', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  summary: text('summary'),
  detectedStack: text('detected_stack'),
  detectedFrameworks: text('detected_frameworks').notNull().default('[]'),
  detectedPackageManager: text('detected_package_manager'),
  detectedDatabase: text('detected_database'),
  detectedAuth: text('detected_auth'),
  detectedDeployment: text('detected_deployment'),
  warnings: text('warnings').notNull().default('[]'),
  fileCount: integer('file_count').notNull().default(0),
  byteCount: integer('byte_count').notNull().default(0),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  errorMessage: text('error_message')
});

export const projectFiles = sqliteTable('project_files', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id').notNull().references(() => projectScans.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  fileType: text('file_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  hash: text('hash'),
  importanceScore: integer('importance_score').notNull().default(0),
  summary: text('summary'),
  lastSeenAt: text('last_seen_at').notNull()
});

export const projectEnvVars = sqliteTable('project_env_vars', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id').notNull().references(() => projectScans.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  variable: text('variable').notNull(),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
  comment: text('comment')
});

export type ProjectScanRow = typeof projectScans.$inferSelect;
export type ProjectFileRow = typeof projectFiles.$inferSelect;
export type ProjectEnvVarRow = typeof projectEnvVars.$inferSelect;

export const projectMemories = sqliteTable('project_memories', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content').notNull(),
  source: text('source').notNull(),
  fileWritten: integer('file_written', { mode: 'boolean' }).notNull().default(false),
  scanId: text('scan_id'),
  createdAt: text('created_at').notNull()
});

export type ProjectMemoryRow = typeof projectMemories.$inferSelect;

export const auditRuns = sqliteTable('audit_runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  scanId: text('scan_id'),
  auditType: text('audit_type').notNull(),
  provider: text('provider'),
  model: text('model'),
  status: text('status').notNull(),
  score: integer('score'),
  riskLevel: text('risk_level'),
  summary: text('summary'),
  recommendedNextAction: text('recommended_next_action'),
  generatedPromptId: text('generated_prompt_id'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  errorMessage: text('error_message')
});

export const auditFindings = sqliteTable('audit_findings', {
  id: text('id').primaryKey(),
  auditRunId: text('audit_run_id').notNull().references(() => auditRuns.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  filePath: text('file_path'),
  lineStart: integer('line_start'),
  lineEnd: integer('line_end'),
  recommendation: text('recommendation'),
  suggestedPrompt: text('suggested_prompt'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull()
});

export const generatedPrompts = sqliteTable('generated_prompts', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  auditRunId: text('audit_run_id'),
  title: text('title').notNull(),
  promptType: text('prompt_type').notNull(),
  content: text('content').notNull(),
  status: text('status').notNull().default('unused'),
  outcomeNotes: text('outcome_notes'),
  createdAt: text('created_at').notNull(),
  usedAt: text('used_at')
});

export type AuditRunRow = typeof auditRuns.$inferSelect;
export type AuditFindingRow = typeof auditFindings.$inferSelect;
export type GeneratedPromptRow = typeof generatedPrompts.$inferSelect;

export const aiSessions = sqliteTable('ai_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  workspaceId: text('workspace_id'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  purpose: text('purpose').notNull(),
  title: text('title'),
  createdAt: text('created_at').notNull()
});

export const aiMessages = sqliteTable('ai_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  createdAt: text('created_at').notNull()
});

export type AiSessionRow = typeof aiSessions.$inferSelect;
export type AiMessageRow = typeof aiMessages.$inferSelect;

export const projectTasks = sqliteTable('project_tasks', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sourceFindingId: text('source_finding_id'),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('backlog'),
  relatedFiles: text('related_files').notNull().default('[]'),
  suggestedPrompt: text('suggested_prompt'),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at')
});

export type ProjectTaskRow = typeof projectTasks.$inferSelect;
