import type { DetectorContext } from './index';

export function detectPackageManager(ctx: DetectorContext): string | null {
  const has = (f: string) => ctx.files.includes(f);
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  if (has('package-lock.json')) return 'npm';
  if (has('package.json')) return 'npm';
  if (has('poetry.lock') || ctx.files.includes('pyproject.toml')) return 'poetry';
  if (has('Pipfile.lock') || has('Pipfile')) return 'pipenv';
  if (has('requirements.txt')) return 'pip';
  if (has('Cargo.toml')) return 'cargo';
  if (has('go.mod')) return 'go modules';
  return null;
}
