import type { DetectionResult } from '@shared/types';
import { detectPackageManager } from './package-manager';
import { detectFrameworks } from './frameworks';
import { detectDatabase } from './database';
import { detectAuth } from './auth';
import { detectDeployment } from './deployment';

export interface DetectorContext {
  rootDir: string;
  files: string[];
  readText: (relPath: string) => string | null;
}

export function detectAll(ctx: DetectorContext): DetectionResult {
  const packageManager = detectPackageManager(ctx);
  const { frameworks, projectType } = detectFrameworks(ctx);
  const database = detectDatabase(ctx);
  const auth = detectAuth(ctx);
  const deployment = detectDeployment(ctx);

  let primaryStack: string | null = null;
  if (frameworks.includes('Next.js')) primaryStack = 'Next.js + React';
  else if (frameworks.includes('Remix')) primaryStack = 'Remix';
  else if (frameworks.includes('Vite') && frameworks.includes('React')) primaryStack = 'React + Vite';
  else if (frameworks.includes('Expo')) primaryStack = 'Expo / React Native';
  else if (frameworks.includes('Electron')) primaryStack = 'Electron';
  else if (frameworks.includes('FastAPI')) primaryStack = 'Python · FastAPI';
  else if (frameworks.includes('Django')) primaryStack = 'Python · Django';
  else if (frameworks.length > 0) primaryStack = frameworks[0] ?? null;

  return { projectType, packageManager, frameworks, database, auth, deployment, primaryStack };
}
