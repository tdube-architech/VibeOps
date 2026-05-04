import type { DetectorContext } from './index';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkg(ctx: DetectorContext): PackageJson | null {
  const text = ctx.readText('package.json');
  if (!text) return null;
  try { return JSON.parse(text) as PackageJson; } catch { return null; }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectFrameworks(ctx: DetectorContext): { frameworks: string[]; projectType: string | null } {
  const f = new Set<string>();
  const has = (p: string) => ctx.files.includes(p);
  const pkg = parsePkg(ctx);

  if (hasDep(pkg, 'next') || ctx.files.some((p) => /^next\.config\.(js|ts|mjs|cjs)$/.test(p))) f.add('Next.js');
  if (hasDep(pkg, 'react')) f.add('React');
  if (hasDep(pkg, 'vue')) f.add('Vue');
  if (hasDep(pkg, 'svelte')) f.add('Svelte');
  if (hasDep(pkg, 'astro') || ctx.files.some((p) => p.startsWith('astro.config.'))) f.add('Astro');
  if (hasDep(pkg, 'remix') || hasDep(pkg, '@remix-run/react')) f.add('Remix');
  if (hasDep(pkg, 'expo')) f.add('Expo');
  if (hasDep(pkg, 'react-native')) f.add('React Native');
  if (hasDep(pkg, 'electron') || has('electron-builder.yml')) f.add('Electron');
  if (hasDep(pkg, 'vite') || ctx.files.some((p) => p.startsWith('vite.config.'))) f.add('Vite');
  if (hasDep(pkg, 'tailwindcss') || ctx.files.some((p) => p.startsWith('tailwind.config.'))) f.add('Tailwind CSS');
  if (has('tauri.conf.json')) f.add('Tauri');
  if (hasDep(pkg, 'drizzle-orm')) f.add('Drizzle ORM');
  if (hasDep(pkg, '@prisma/client') || has('prisma/schema.prisma')) f.add('Prisma');

  const reqs = ctx.readText('requirements.txt') ?? '';
  const pyproject = ctx.readText('pyproject.toml') ?? '';
  if (/(^|\n)\s*fastapi\b/i.test(reqs) || /fastapi/i.test(pyproject)) f.add('FastAPI');
  if (/(^|\n)\s*django\b/i.test(reqs) || /django/i.test(pyproject)) f.add('Django');
  if (/(^|\n)\s*flask\b/i.test(reqs) || /flask/i.test(pyproject)) f.add('Flask');

  let projectType: string | null = null;
  if (f.has('Next.js')) projectType = 'Next.js Application';
  else if (f.has('Remix')) projectType = 'Remix Application';
  else if (f.has('Astro')) projectType = 'Astro Site';
  else if (f.has('Expo')) projectType = 'Expo / React Native App';
  else if (f.has('React Native')) projectType = 'React Native App';
  else if (f.has('Electron')) projectType = 'Electron Desktop App';
  else if (f.has('Tauri')) projectType = 'Tauri Desktop App';
  else if (f.has('Vite') && f.has('React')) projectType = 'React + Vite SPA';
  else if (f.has('FastAPI')) projectType = 'FastAPI Service';
  else if (f.has('Django')) projectType = 'Django Application';
  else if (f.has('Flask')) projectType = 'Flask Application';

  return { frameworks: Array.from(f), projectType };
}
