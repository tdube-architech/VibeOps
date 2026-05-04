import fs from 'node:fs';
import path from 'node:path';

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remoteUrl: string | null;
  dirty: boolean | null;
}

export function detectGit(rootDir: string): GitStatus {
  const gitDir = path.join(rootDir, '.git');
  if (!fs.existsSync(gitDir)) {
    return { isRepo: false, branch: null, remoteUrl: null, dirty: null };
  }

  let branch: string | null = null;
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice('ref: '.length);
      branch = ref.replace(/^refs\/heads\//, '');
    } else if (/^[0-9a-f]{40}$/.test(head)) {
      branch = `(detached @ ${head.slice(0, 7)})`;
    }
  } catch { /* ignore */ }

  let remoteUrl: string | null = null;
  try {
    const config = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
    const m = config.match(/\[remote "origin"\][^[]*url\s*=\s*([^\s]+)/);
    if (m && m[1]) remoteUrl = m[1];
  } catch { /* ignore */ }

  let dirty: boolean | null = null;
  try {
    const indexStat = fs.statSync(path.join(gitDir, 'index'));
    const headStat = fs.statSync(path.join(gitDir, 'HEAD'));
    dirty = indexStat.mtimeMs > headStat.mtimeMs;
  } catch { /* ignore */ }

  return { isRepo: true, branch, remoteUrl, dirty };
}
