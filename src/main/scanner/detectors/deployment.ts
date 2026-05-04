import type { DetectorContext } from './index';

export function detectDeployment(ctx: DetectorContext): string | null {
  const has = (p: string) => ctx.files.includes(p);
  if (has('vercel.json')) return 'Vercel';
  if (has('netlify.toml')) return 'Netlify';
  if (has('render.yaml')) return 'Render';
  if (has('fly.toml')) return 'Fly.io';
  if (has('docker-compose.yml') || has('docker-compose.yaml')) return 'Docker Compose';
  if (has('Dockerfile')) return 'Docker';
  if (has('.github/workflows/deploy.yml') || has('.github/workflows/deploy.yaml')) return 'GitHub Actions deploy';
  return null;
}
