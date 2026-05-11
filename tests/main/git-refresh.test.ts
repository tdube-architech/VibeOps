import { describe, it, expect, vi } from 'vitest';
import { refreshGit, type GitRefreshDeps } from '../../src/main/projects/git-refresh';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function makeDeps(opts: {
  hasDir?: boolean;
  results?: Record<string, { status: number; stdout: string; stderr: string }>;
}): GitRefreshDeps {
  const results = opts.results ?? {};
  return {
    hasDir: () => opts.hasDir ?? true,
    spawn: vi.fn(async (cmd: string, args: string[]) => {
      const key = `${cmd} ${args.join(' ')}`;
      for (const k of Object.keys(results)) {
        if (key.startsWith(k)) return results[k]!;
      }
      return { status: 0, stdout: '', stderr: '' };
    })
  };
}

describe('refreshGit', () => {
  it('skips when .git directory is absent', async () => {
    const deps = makeDeps({ hasDir: false });
    const result = await refreshGit('C:\\tmp', logger, deps);
    expect(result.attempted).toBe(false);
    expect(result.fetched).toBe(false);
    expect(deps.spawn).not.toHaveBeenCalled();
  });

  it('reports fetched=false on fetch failure (soft-fail)', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 128, stdout: '', stderr: 'fatal: could not read Username for' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.attempted).toBe(true);
    expect(result.fetched).toBe(false);
    expect(result.pulled).toBe(false);
    expect(result.message).toMatch(/could not refresh/i);
  });

  it('reports up-to-date when ahead=0 behind=0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t0\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.fetched).toBe(true);
    expect(result.pulled).toBe(false);
    expect(result.behind).toBe(0);
    expect(result.ahead).toBe(0);
    expect(result.dirty).toBe(false);
    expect(result.message).toMatch(/up to date/i);
  });

  it('pulls when clean and behind > 0 and ahead == 0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t3\n', stderr: '' },
        'git pull --ff-only': { status: 0, stdout: '', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(true);
    expect(result.behind).toBe(3);
    expect(result.message).toMatch(/fast-forwarded 3/i);
  });

  it('skips pull when working tree is dirty even if behind', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: ' M src/foo.ts\n', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '0\t2\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(false);
    expect(result.dirty).toBe(true);
    expect(result.behind).toBe(2);
    expect(result.message).toMatch(/remote ahead by 2.*uncommitted/i);
  });

  it('skips pull and reports diverged when ahead and behind both > 0', async () => {
    const deps = makeDeps({
      results: {
        'git fetch': { status: 0, stdout: '', stderr: '' },
        'git status --porcelain': { status: 0, stdout: '', stderr: '' },
        'git rev-parse': { status: 0, stdout: 'main\n', stderr: '' },
        'git rev-list': { status: 0, stdout: '1\t2\n', stderr: '' }
      }
    });
    const result = await refreshGit('C:\\repo', logger, deps);
    expect(result.pulled).toBe(false);
    expect(result.ahead).toBe(1);
    expect(result.behind).toBe(2);
    expect(result.message).toMatch(/diverged/i);
  });
});
