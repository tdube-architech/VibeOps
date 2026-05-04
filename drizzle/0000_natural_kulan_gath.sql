CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`local_path` text NOT NULL,
	`repo_url` text,
	`category` text,
	`status` text DEFAULT 'active' NOT NULL,
	`primary_stack` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_scanned_at` text,
	`last_audited_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_local_path_unique` ON `projects` (`local_path`);