-- Drop the UNIQUE constraint on projects.local_path so a single localPath can
-- be referenced by both the legacy local-only row and the stub mirror of a
-- cloud-synced project after migration.
DROP INDEX IF EXISTS `projects_local_path_unique`;
