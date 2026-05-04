CREATE TABLE `project_env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`filename` text NOT NULL,
	`variable` text NOT NULL,
	`required` integer DEFAULT true NOT NULL,
	`comment` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `project_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`path` text NOT NULL,
	`file_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`hash` text,
	`importance_score` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `project_scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`detected_stack` text,
	`detected_frameworks` text DEFAULT '[]' NOT NULL,
	`detected_package_manager` text,
	`detected_database` text,
	`detected_auth` text,
	`detected_deployment` text,
	`warnings` text DEFAULT '[]' NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`byte_count` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_message` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_files_scan_path
  ON project_files (project_id, scan_id, path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_files_project ON project_files (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_project_scans_project ON project_scans (project_id);
