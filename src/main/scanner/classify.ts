import path from 'node:path';
import type { FileType } from '@shared/types';
import { isEnvExample, isSecretFilename } from './ignore-rules';

const SOURCE_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.php', '.java', '.kt', '.swift',
  '.cs', '.cpp', '.c', '.h', '.hpp', '.scala', '.dart', '.lua', '.sql', '.sh', '.ps1'
]);

const CONFIG_BASENAMES = new Set([
  'package.json', 'tsconfig.json', 'jsconfig.json',
  'next.config.js', 'next.config.ts', 'next.config.mjs',
  'vite.config.ts', 'vite.config.js',
  'tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs',
  'postcss.config.js', 'postcss.config.cjs',
  'astro.config.mjs', 'astro.config.ts',
  'svelte.config.js',
  'remix.config.js',
  'docker-compose.yml', 'docker-compose.yaml', 'Dockerfile',
  'vercel.json', 'netlify.toml', 'render.yaml', 'fly.toml',
  'pyproject.toml', 'requirements.txt', 'Pipfile', 'setup.py', 'setup.cfg',
  'Cargo.toml', 'go.mod', 'go.sum',
  'tauri.conf.json',
  'electron-builder.yml', 'electron-builder.yaml',
  'drizzle.config.ts', 'drizzle.config.js'
]);

const LOCK_BASENAMES = new Set([
  'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
  'poetry.lock', 'Pipfile.lock', 'Cargo.lock', 'go.sum'
]);

const DOC_BASENAMES = new Set([
  'README.md', 'README.MD', 'readme.md', 'CHANGELOG.md', 'CONTRIBUTING.md',
  'LICENSE', 'LICENSE.md', 'CLAUDE.md', 'AGENTS.md', 'memory.md', 'MEMORY.md'
]);

const ASSET_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.mp3', '.wav']);
const BINARY_EXT = new Set(['.dll', '.bin', '.dat', '.zip', '.tar', '.gz', '.7z']);

const GENERATED_HINTS = ['__generated__', '/generated/', '.generated.', '.gen.'];

const HEAD_CONFIGS = new Set([
  'next.config.js', 'next.config.ts', 'vite.config.ts', 'vite.config.js',
  'tailwind.config.cjs', 'tailwind.config.ts', 'tsconfig.json',
  'docker-compose.yml', 'Dockerfile', 'vercel.json', 'netlify.toml',
  'pyproject.toml', 'requirements.txt', 'Cargo.toml', 'go.mod',
  'tauri.conf.json', 'electron-builder.yml'
]);

export function classifyFile(relPath: string): FileType {
  const norm = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(norm);
  const ext = path.posix.extname(norm).toLowerCase();

  if (isEnvExample(norm)) return 'env-example';
  if (isSecretFilename(norm)) return 'env-secret';
  if (LOCK_BASENAMES.has(base)) return 'lock';
  if (CONFIG_BASENAMES.has(base)) return 'config';
  if (DOC_BASENAMES.has(base) || (ext === '.md' && norm.startsWith('docs/'))) return 'doc';

  if (/\.(test|spec)\.(t|j)sx?$/.test(base)) return 'test';
  if (/^test_/.test(base) && (ext === '.py' || ext === '.ts' || ext === '.js')) return 'test';
  if (norm.includes('/tests/') || norm.startsWith('tests/')) return 'test';

  if (ASSET_EXT.has(ext)) return 'asset';
  if (BINARY_EXT.has(ext)) return 'binary';
  if (SOURCE_EXT.has(ext)) return 'source';

  if (ext === '.json' || ext === '.yaml' || ext === '.yml' || ext === '.toml') return 'config';
  if (ext === '.md' || ext === '.mdx' || ext === '.txt' || ext === '.rst') return 'doc';
  return 'unknown';
}

export function importanceScore(relPath: string): number {
  const norm = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(norm);
  const depth = norm.split('/').length - 1;
  let score = 50 - Math.min(depth * 4, 30);

  if (base === 'package.json' && depth === 0) score = 100;
  else if (base === 'README.md' && depth === 0) score = Math.max(score, 90);
  else if (base === 'memory.md' && depth === 0) score = Math.max(score, 95);
  else if (norm === 'CLAUDE.md' || norm === 'AGENTS.md') score = Math.max(score, 85);
  else if (HEAD_CONFIGS.has(base) && depth <= 1) score = Math.max(score, 80);
  else if (norm.includes('schema.prisma')) score = Math.max(score, 90);
  else if (norm.includes('supabase/migrations/')) score = Math.max(score, 80);
  else if (norm.includes('schema.sql')) score = Math.max(score, 80);

  if (GENERATED_HINTS.some((h) => norm.includes(h))) score = Math.min(score, 20);

  return Math.max(0, Math.min(100, score));
}
