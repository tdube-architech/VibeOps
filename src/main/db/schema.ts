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
  lastAuditedAt: text('last_audited_at')
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

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
