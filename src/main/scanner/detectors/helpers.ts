import type { DetectorContext } from './index';

export function appPath(ctx: DetectorContext, rel: string): string {
  return `${ctx.appPrefix}${rel}`;
}

export function hasAppFile(ctx: DetectorContext, rel: string): boolean {
  return ctx.files.includes(appPath(ctx, rel));
}

export function readAppFile(ctx: DetectorContext, rel: string): string | null {
  return ctx.readText(appPath(ctx, rel));
}

export function hasAppFileMatching(ctx: DetectorContext, predicate: (rel: string) => boolean): boolean {
  const prefix = ctx.appPrefix;
  return ctx.files.some((p) => {
    if (!p.startsWith(prefix)) return false;
    const local = p.slice(prefix.length);
    if (local.includes('/')) return false;
    return predicate(local);
  });
}
