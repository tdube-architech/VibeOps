CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);--> statement-breakpoint
ALTER TABLE `projects` ADD `workspace_id` text;--> statement-breakpoint
INSERT OR IGNORE INTO workspaces (id, name, slug, description, created_at, updated_at)
VALUES ('ws_local', 'Local Workspace', 'local', 'Default workspace created by Phase 6.5 migration.',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
UPDATE projects SET workspace_id = 'ws_local' WHERE workspace_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects (workspace_id);
