CREATE TABLE `project_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`source` text NOT NULL,
	`file_written` integer DEFAULT false NOT NULL,
	`scan_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_memories_project_version
  ON project_memories (project_id, version DESC);
