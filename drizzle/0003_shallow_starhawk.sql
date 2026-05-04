CREATE TABLE `audit_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_run_id` text NOT NULL,
	`project_id` text NOT NULL,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`file_path` text,
	`line_start` integer,
	`line_end` integer,
	`recommendation` text,
	`suggested_prompt` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`audit_run_id`) REFERENCES `audit_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`scan_id` text,
	`audit_type` text NOT NULL,
	`provider` text,
	`model` text,
	`status` text NOT NULL,
	`score` integer,
	`risk_level` text,
	`summary` text,
	`recommended_next_action` text,
	`generated_prompt_id` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_message` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `generated_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`audit_run_id` text,
	`title` text NOT NULL,
	`prompt_type` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'unused' NOT NULL,
	`outcome_notes` text,
	`created_at` text NOT NULL,
	`used_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_findings_run ON audit_findings (audit_run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_findings_project ON audit_findings (project_id, severity);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_runs_project ON audit_runs (project_id, started_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_generated_prompts_project ON generated_prompts (project_id, created_at DESC);
