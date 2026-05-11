import path from 'node:path';
import type { Logger } from 'pino';

export const GIT_FETCH_TIMEOUT_MS = 30_000;

export interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

export interface SpawnFn {
  (cmd: string, args: string[], opts: {
    cwd: string;
    timeoutMs: number;
    env: Record<string, string>;
  }): Promise<SpawnResult>;
}

export interface GitRefreshDeps {
  spawn: SpawnFn;
  hasDir: (path: string) => boolean;
}

export interface GitRefreshResult {
  attempted: boolean;
  fetched: boolean;
  pulled: boolean;
  dirty: boolean;
  ahead: number;
  behind: number;
  message: string;
}

const ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0' } as Record<string, string>;

export async function refreshGit(
  rootDir: string,
  logger: Logger,
  deps: GitRefreshDeps
): Promise<GitRefreshResult> {
  if (!deps.hasDir(path.join(rootDir, '.git'))) {
    return { attempted: false, fetched: false, pulled: false, dirty: false, ahead: 0, behind: 0, message: 'not a git repo' };
  }

  const baseOpts = { cwd: rootDir, timeoutMs: GIT_FETCH_TIMEOUT_MS, env: ENV };

  const fetched = await deps.spawn('git', ['fetch', 'origin', '--quiet', '--no-tags'], baseOpts);
  if (fetched.status !== 0) {
    logger.warn({ stderr: fetched.stderr }, 'git fetch failed');
    return { attempted: true, fetched: false, pulled: false, dirty: false, ahead: 0, behind: 0, message: 'Could not refresh remote (continuing)' };
  }

  const status = await deps.spawn('git', ['status', '--porcelain'], baseOpts);
  const dirty = status.status === 0 && status.stdout.trim().length > 0;

  const branchOut = await deps.spawn('git', ['rev-parse', '--abbrev-ref', 'HEAD'], baseOpts);
  const branch = branchOut.status === 0 ? branchOut.stdout.trim() : 'HEAD';

  let ahead = 0;
  let behind = 0;
  if (branch !== 'HEAD') {
    const counts = await deps.spawn('git', ['rev-list', '--left-right', '--count', `HEAD...origin/${branch}`], baseOpts);
    if (counts.status === 0) {
      const parts = counts.stdout.trim().split(/\s+/);
      ahead = Number.parseInt(parts[0] ?? '0', 10) || 0;
      behind = Number.parseInt(parts[1] ?? '0', 10) || 0;
    }
  }

  let pulled = false;
  if (!dirty && behind > 0 && ahead === 0) {
    const pull = await deps.spawn('git', ['pull', '--ff-only', 'origin'], baseOpts);
    pulled = pull.status === 0;
    if (!pulled) logger.warn({ stderr: pull.stderr }, 'git pull --ff-only failed');
  }

  const message = describe({ fetched: true, pulled, dirty, ahead, behind });
  return { attempted: true, fetched: true, pulled, dirty, ahead, behind, message };
}

function describe(r: { fetched: boolean; pulled: boolean; dirty: boolean; ahead: number; behind: number }): string {
  if (r.pulled) return `Fast-forwarded ${r.behind} commit${r.behind === 1 ? '' : 's'}`;
  if (r.dirty && r.behind > 0) return `Remote ahead by ${r.behind} — local has uncommitted changes`;
  if (r.ahead > 0 && r.behind > 0) return `Diverged from origin by ${r.ahead}/${r.behind} (push or rebase)`;
  if (r.behind === 0 && r.ahead === 0) return 'Up to date with remote';
  if (r.ahead > 0 && r.behind === 0) return `Local ahead by ${r.ahead} — push when ready`;
  return 'Remote refresh complete';
}
