import type { DetectionResult, ScanWarning } from '@shared/types';

export function buildSummary(args: {
  fileCount: number;
  byteCount: number;
  detection: DetectionResult;
  warnings: ScanWarning[];
}): string {
  const { detection, fileCount, byteCount, warnings } = args;
  const sizeMB = (byteCount / (1024 * 1024)).toFixed(1);
  const parts: string[] = [];

  if (detection.projectType) parts.push(`${detection.projectType}.`);
  if (detection.primaryStack) parts.push(`Primary stack: ${detection.primaryStack}.`);
  else if (detection.frameworks.length > 0) parts.push(`Frameworks: ${detection.frameworks.join(', ')}.`);

  if (detection.packageManager) parts.push(`Package manager: ${detection.packageManager}.`);
  if (detection.database) parts.push(`Database: ${detection.database}.`);
  if (detection.auth) parts.push(`Auth: ${detection.auth}.`);
  if (detection.deployment) parts.push(`Deployment target: ${detection.deployment}.`);

  parts.push(`Indexed ${fileCount} files (~${sizeMB} MB).`);

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} captured.`);
  }

  if (parts.length === 1 && fileCount === 0) return 'Empty project — no files indexed.';
  return parts.join(' ');
}
