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

export function detectAuth(ctx: DetectorContext): string | null {
  const pkg = parsePkg(ctx);
  if (ctx.files.includes('supabase/config.toml') || hasDep(pkg, '@supabase/supabase-js')) return 'Supabase Auth';
  if (hasDep(pkg, 'next-auth')) return 'NextAuth';
  if (hasDep(pkg, '@clerk/nextjs') || hasDep(pkg, '@clerk/clerk-sdk-node')) return 'Clerk';
  if (hasDep(pkg, '@auth0/nextjs-auth0') || hasDep(pkg, 'auth0')) return 'Auth0';
  if (hasDep(pkg, 'firebase')) return 'Firebase Auth';
  if (hasDep(pkg, 'lucia')) return 'Lucia Auth';
  if (hasDep(pkg, 'better-auth')) return 'Better Auth';
  return null;
}
