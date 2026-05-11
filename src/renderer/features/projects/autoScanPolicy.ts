export const AUTO_SCAN_COOLDOWN_MS = 5 * 60 * 1000;

export interface AutoScanInput {
  project: {
    id: string;
    localPath: string;
    source?: 'cloud' | 'local';
    lastScannedAt?: string | null;
  } | undefined;
  lastAttemptedId: string | null;
  now: number;
}

export interface AutoScanDecision {
  action: 'trigger' | 'skip';
  reason: string;
}

export function decideAutoScan(input: AutoScanInput): AutoScanDecision {
  const { project, lastAttemptedId, now } = input;

  if (!project) return { action: 'skip', reason: 'no project' };
  if (!project.localPath) return { action: 'skip', reason: 'no local path (cloud-only view)' };
  if (lastAttemptedId === project.id) {
    return { action: 'skip', reason: 'already attempted this mount' };
  }

  const last = project.lastScannedAt ? new Date(project.lastScannedAt).getTime() : null;
  if (last === null) return { action: 'trigger', reason: 'never scanned' };

  const ageMs = now - last;
  if (ageMs <= AUTO_SCAN_COOLDOWN_MS) {
    return { action: 'skip', reason: `within cooldown (${Math.round(ageMs / 1000)}s ago)` };
  }
  return { action: 'trigger', reason: `stale (${Math.round(ageMs / 1000)}s ago)` };
}
