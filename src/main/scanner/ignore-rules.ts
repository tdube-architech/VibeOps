import ignore, { type Ignore } from 'ignore';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_IGNORES: readonly string[] = [
  'node_modules/',
  '.git/',
  '.next/',
  '.turbo/',
  '.cache/',
  '.vercel/',
  '.netlify/',
  'dist/',
  'build/',
  'coverage/',
  'out/',
  'release/',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.*.local',
  '*.pem',
  '*.key',
  '*.pfx',
  '*.sqlite',
  '*.sqlite-journal',
  '*.db',
  '*.db-journal',
  '*.log',
  'storybook-static/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.tox/',
  '.mypy_cache/',
  '.pytest_cache/',
  '.gradle/',
  'target/'
];

const SECRET_FILENAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test'
]);

export function isSecretFilename(p: string): boolean {
  const base = path.basename(p);
  if (SECRET_FILENAMES.has(base)) return true;
  if (/^\.env\.[^.]+\.local$/.test(base)) return true;
  return false;
}

export function isEnvExample(p: string): boolean {
  const base = path.basename(p);
  return base === '.env.example' || base === '.env.local.example' || base === '.env.sample';
}

export function buildIgnore(rootDir: string, extras: readonly string[] = []): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES.slice());

  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      ig.add(content);
    } catch {
      // fallback to defaults
    }
  }

  if (extras.length > 0) ig.add(extras.slice());
  return ig;
}
