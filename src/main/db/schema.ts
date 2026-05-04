import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
