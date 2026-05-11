ALTER TABLE `project_tasks` ADD COLUMN `source_signature` text;
CREATE INDEX `idx_project_tasks_source_signature`
  ON `project_tasks` (`project_id`, `source_signature`);
