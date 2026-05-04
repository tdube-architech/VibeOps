CREATE TABLE `project_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_finding_id` text,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`related_files` text DEFAULT '[]' NOT NULL,
	`suggested_prompt` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks (project_id, status);
