import type { DraftFinding } from '../findings';
import type { Scan, ScanFile, ScanEnvVar } from '@shared/types';

export interface DeploymentContext {
  scan: Scan;
  files: ScanFile[];
  envVars: ScanEnvVar[];
  readText: (relPath: string) => string | null;
  hasFile: (relPath: string) => boolean;
}

export function checkDeployment(ctx: DeploymentContext): DraftFinding[] {
  const out: DraftFinding[] = [];

  if (!ctx.scan.detection.deployment) {
    out.push({
      severity: 'medium', category: 'deployment',
      title: 'No deployment target detected',
      description: 'No vercel.json, netlify.toml, render.yaml, fly.toml, Dockerfile, or compose file detected.',
      recommendation: 'Document where this project is deployed (or pick a target) and capture build/start commands in README or memory.md.'
    });
  }

  const pkgText = ctx.readText('package.json');
  if (pkgText) {
    try {
      const pkg = JSON.parse(pkgText) as { scripts?: Record<string, string> };
      const scripts = pkg.scripts ?? {};
      if (!scripts.build && (ctx.scan.detection.frameworks.includes('Next.js') || ctx.scan.detection.frameworks.includes('Vite'))) {
        out.push({
          severity: 'medium', category: 'deployment',
          title: 'No `build` script in package.json',
          description: 'A bundler is detected but no `build` script is wired up. Hosts like Vercel and Netlify run `build` by default.',
          filePath: 'package.json',
          recommendation: 'Add a `build` script (e.g. `next build` or `vite build`).'
        });
      }
      if (!scripts.start && ctx.scan.detection.frameworks.includes('Next.js')) {
        out.push({
          severity: 'low', category: 'deployment',
          title: 'No `start` script in package.json',
          description: 'Next.js production servers require `next start` for non-static deployments.',
          filePath: 'package.json',
          recommendation: 'Add `"start": "next start"` if this app is deployed to a Node host.'
        });
      }
    } catch { /* ignore */ }
  }

  if (ctx.hasFile('Dockerfile') && !ctx.hasFile('docker-compose.yml') && !ctx.hasFile('docker-compose.yaml')) {
    out.push({
      severity: 'low', category: 'deployment',
      title: 'Dockerfile present without docker-compose',
      description: 'Local dev parity may be hard. Compose makes multi-service local runs reliable.',
      filePath: 'Dockerfile',
      recommendation: 'Add a `docker-compose.yml` for local development if the app needs services like a DB.'
    });
  }

  return out;
}
