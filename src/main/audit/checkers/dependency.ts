import type { DraftFinding } from '../findings';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';

export interface DependencyContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
  hasFile: (relPath: string) => boolean;
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'];

export function checkDependencies(ctx: DependencyContext): DraftFinding[] {
  const out: DraftFinding[] = [];
  const lockPresent = LOCKFILES.filter((p) => ctx.hasFile(p));
  const hasPackageJson = ctx.hasFile('package.json');

  if (lockPresent.length > 1) {
    out.push({
      severity: 'medium', category: 'dependency',
      title: 'Multiple lockfiles detected',
      description: `Found ${lockPresent.join(', ')}. Mixed package managers can cause version drift.`,
      recommendation: 'Pick one package manager and remove other lockfiles.'
    });
  }

  if (hasPackageJson && lockPresent.length === 0) {
    out.push({
      severity: 'low', category: 'dependency',
      title: 'No lockfile present',
      description: 'package.json exists without a corresponding lockfile.',
      recommendation: 'Run `pnpm install` (or your package manager) and commit the lockfile.'
    });
  }

  const text = ctx.readText('package.json');
  if (text) {
    try {
      const pkg = JSON.parse(text) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const [name, spec] of Object.entries(all)) {
        if (/^(github|git\+|file:|link:|patch:)/i.test(spec) || spec.startsWith('http')) {
          out.push({
            severity: 'medium', category: 'dependency',
            title: `Dependency '${name}' uses non-registry source`,
            description: `Spec: ${spec}`,
            filePath: 'package.json',
            recommendation: 'Consider pinning to a published version or vendoring the patch and documenting why.'
          });
        }
      }
    } catch { /* ignore */ }
  }

  return out;
}
