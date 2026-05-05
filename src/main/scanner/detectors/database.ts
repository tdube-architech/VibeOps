import type { DetectorContext } from './index';
import { hasAppFile, readAppFile } from './helpers';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function parsePkg(ctx: DetectorContext): PackageJson | null {
  const text = readAppFile(ctx, 'package.json');
  if (!text) return null;
  try { return JSON.parse(text) as PackageJson; } catch { return null; }
}

function hasDep(pkg: PackageJson | null, name: string): boolean {
  if (!pkg) return false;
  return !!(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

export function detectDatabase(ctx: DetectorContext): string | null {
  const has = (p: string) => hasAppFile(ctx, p);
  const pkg = parsePkg(ctx);

  if (has('supabase/config.toml') || hasDep(pkg, '@supabase/supabase-js')) return 'Supabase Postgres';

  if (has('prisma/schema.prisma')) {
    const schema = readAppFile(ctx, 'prisma/schema.prisma') ?? '';
    if (/provider\s*=\s*"postgresql"/.test(schema)) return 'Prisma + PostgreSQL';
    if (/provider\s*=\s*"mysql"/.test(schema)) return 'Prisma + MySQL';
    if (/provider\s*=\s*"sqlite"/.test(schema)) return 'Prisma + SQLite';
    return 'Prisma';
  }
  if (hasDep(pkg, 'drizzle-orm')) {
    if (hasDep(pkg, 'better-sqlite3') || hasDep(pkg, '@libsql/client')) return 'Drizzle + SQLite';
    if (hasDep(pkg, 'pg') || hasDep(pkg, 'postgres')) return 'Drizzle + PostgreSQL';
    return 'Drizzle ORM';
  }
  if (hasDep(pkg, 'mongoose') || hasDep(pkg, 'mongodb')) return 'MongoDB';
  if (hasDep(pkg, 'firebase') || hasDep(pkg, 'firebase-admin')) return 'Firebase / Firestore';
  if (hasDep(pkg, 'redis') || hasDep(pkg, 'ioredis')) return 'Redis';
  if (has('schema.sql')) return 'SQL (schema.sql present)';
  return null;
}
