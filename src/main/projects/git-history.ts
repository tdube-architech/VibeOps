import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import type { GitBranch, GitCommit, GitInfo, GitStatus } from '@shared/types';
import { detectGit } from '@main/scanner/detectors/git';

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 8_000;
const RECORD_SEP = '';
const FIELD_SEP = '';

async function runGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

async function gitBinaryAvailable(cwd: string): Promise<boolean> {
  return (await runGit(cwd, ['--version'])) !== null;
}

function parseCommits(stdout: string): GitCommit[] {
  if (!stdout) return [];
  const records = stdout.split(RECORD_SEP).map((r) => r.trim()).filter(Boolean);
  const out: GitCommit[] = [];
  for (const rec of records) {
    const parts = rec.split(FIELD_SEP);
    if (parts.length < 6) continue;
    const [sha, shortSha, author, email, date, subject] = parts as [string, string, string, string, string, string];
    out.push({ sha, shortSha, author, email, date, subject });
  }
  return out;
}

async function fetchRecentCommits(cwd: string, limit: number): Promise<GitCommit[]> {
  const fmt = ['%H', '%h', '%an', '%ae', '%aI', '%s'].join(FIELD_SEP) + RECORD_SEP;
  const stdout = await runGit(cwd, ['log', `-n${limit}`, `--pretty=format:${fmt}`]);
  return stdout ? parseCommits(stdout) : [];
}

async function fetchBranches(cwd: string): Promise<GitBranch[]> {
  const fmt = ['%(refname:short)', '%(HEAD)', '%(upstream:short)', '%(objectname)', '%(objectname:short)',
    '%(authorname)', '%(authoremail)', '%(authordate:iso8601-strict)', '%(contents:subject)'].join(FIELD_SEP) + RECORD_SEP;
  const stdout = await runGit(cwd, ['for-each-ref', '--sort=-committerdate', `--format=${fmt}`, 'refs/heads']);
  if (!stdout) return [];

  const out: GitBranch[] = [];
  for (const rec of stdout.split(RECORD_SEP).map((r) => r.trim()).filter(Boolean)) {
    const parts = rec.split(FIELD_SEP);
    if (parts.length < 9) continue;
    const [name, head, upstream, sha, shortSha, author, email, date, subject] = parts as [
      string, string, string, string, string, string, string, string, string
    ];
    const trimmedEmail = email.replace(/^<|>$/g, '');
    const lastCommit: GitCommit | null = sha
      ? { sha, shortSha, author, email: trimmedEmail, date, subject }
      : null;
    out.push({
      name,
      isCurrent: head.trim() === '*',
      upstream: upstream || null,
      lastCommit
    });
  }
  return out;
}

async function fetchRemotes(cwd: string): Promise<Array<{ name: string; url: string }>> {
  const stdout = await runGit(cwd, ['remote', '-v']);
  if (!stdout) return [];
  const seen = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)/);
    if (match?.[1] && match[2]) seen.set(match[1], match[2]);
  }
  return [...seen.entries()].map(([name, url]) => ({ name, url }));
}

async function fetchAheadBehind(cwd: string): Promise<{ ahead: number | null; behind: number | null; upstream: string | null }> {
  const upstreamOut = await runGit(cwd, ['rev-parse', '--abbrev-ref', '@{upstream}']);
  const upstream = upstreamOut?.trim() || null;
  if (!upstream) return { ahead: null, behind: null, upstream: null };
  const counts = await runGit(cwd, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]);
  if (!counts) return { ahead: null, behind: null, upstream };
  const match = counts.trim().match(/^(\d+)\s+(\d+)$/);
  if (!match) return { ahead: null, behind: null, upstream };
  return { behind: Number(match[1]), ahead: Number(match[2]), upstream };
}

async function fetchDirtyCount(cwd: string): Promise<boolean | null> {
  const stdout = await runGit(cwd, ['status', '--porcelain']);
  if (stdout === null) return null;
  return stdout.trim().length > 0;
}

async function fetchHeadCommit(cwd: string): Promise<GitCommit | null> {
  const commits = await fetchRecentCommits(cwd, 1);
  return commits[0] ?? null;
}

export async function getGitInfo(rootDir: string, options: { commitLimit?: number } = {}): Promise<GitInfo> {
  const limit = options.commitLimit ?? 30;

  const fsStatus = detectGit(rootDir);
  const baseStatus: GitStatus = {
    isRepo: fsStatus.isRepo,
    branch: fsStatus.branch,
    remoteUrl: fsStatus.remoteUrl,
    dirty: fsStatus.dirty,
    aheadBy: null,
    behindBy: null,
    upstream: null,
    lastCommit: null,
    hasGitBinary: false
  };

  if (!fsStatus.isRepo) {
    return { status: baseStatus, recentCommits: [], branches: [], remotes: [] };
  }

  const gitDir = path.join(rootDir, '.git');
  if (!fs.existsSync(gitDir)) {
    return { status: baseStatus, recentCommits: [], branches: [], remotes: [] };
  }

  const hasBinary = await gitBinaryAvailable(rootDir);
  if (!hasBinary) {
    return { status: { ...baseStatus, hasGitBinary: false }, recentCommits: [], branches: [], remotes: [] };
  }

  const [recentCommits, branches, remotes, aheadBehind, dirty, lastCommit] = await Promise.all([
    fetchRecentCommits(rootDir, limit),
    fetchBranches(rootDir),
    fetchRemotes(rootDir),
    fetchAheadBehind(rootDir),
    fetchDirtyCount(rootDir),
    fetchHeadCommit(rootDir)
  ]);

  const originRemote = remotes.find((r) => r.name === 'origin') ?? remotes[0];
  const status: GitStatus = {
    isRepo: true,
    branch: fsStatus.branch,
    remoteUrl: originRemote?.url ?? fsStatus.remoteUrl,
    dirty: dirty ?? fsStatus.dirty,
    aheadBy: aheadBehind.ahead,
    behindBy: aheadBehind.behind,
    upstream: aheadBehind.upstream,
    lastCommit,
    hasGitBinary: true
  };

  return { status, recentCommits, branches, remotes };
}
