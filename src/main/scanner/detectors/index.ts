import type { DetectionResult } from '@shared/types';
import { detectPackageManager } from './package-manager';
import { detectFrameworks } from './frameworks';
import { detectDatabase } from './database';
import { detectAuth } from './auth';
import { detectDeployment } from './deployment';
import { detectGit } from './git';

export interface DetectorContext {
  rootDir: string;
  files: string[];
  readText: (relPath: string) => string | null;
  /** Subdirectory prefix (with trailing slash) where the primary project lives. Empty if at repo root. */
  appPrefix: string;
}

const APP_ROOT_MARKERS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Pipfile',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts'
];

function findAppPrefix(files: string[]): string {
  let best: string | null = null;
  for (const rel of files) {
    const slash = rel.lastIndexOf('/');
    const base = slash >= 0 ? rel.slice(slash + 1) : rel;
    if (!APP_ROOT_MARKERS.includes(base)) continue;
    const prefix = slash >= 0 ? rel.slice(0, slash + 1) : '';
    if (best === null || prefix.length < best.length) best = prefix;
    if (best === '') break;
  }
  return best ?? '';
}

export function detectAll(rawCtx: Omit<DetectorContext, 'appPrefix'>): DetectionResult {
  const appPrefix = findAppPrefix(rawCtx.files);
  const ctx: DetectorContext = { ...rawCtx, appPrefix };
  const packageManager = detectPackageManager(ctx);
  const { frameworks, projectType } = detectFrameworks(ctx);
  const database = detectDatabase(ctx);
  const auth = detectAuth(ctx);
  const deployment = detectDeployment(ctx);
  const git = detectGit(ctx.rootDir);

  let primaryStack: string | null = null;
  if (frameworks.includes('Next.js')) primaryStack = 'Next.js + React';
  else if (frameworks.includes('Remix')) primaryStack = 'Remix';
  else if (frameworks.includes('Vite') && frameworks.includes('React')) primaryStack = 'React + Vite';
  else if (frameworks.includes('Expo')) primaryStack = 'Expo / React Native';
  else if (frameworks.includes('Electron')) primaryStack = 'Electron';
  else if (frameworks.includes('FastAPI')) primaryStack = 'Python · FastAPI';
  else if (frameworks.includes('Django')) primaryStack = 'Python · Django';
  else if (frameworks.length > 0) primaryStack = frameworks[0] ?? null;

  return { projectType, packageManager, frameworks, database, auth, deployment, primaryStack, git };
}
