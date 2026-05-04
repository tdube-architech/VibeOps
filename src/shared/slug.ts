const MAX_LEN = 64;

export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LEN);
  return normalized.length > 0 ? normalized : 'project';
}

export function ensureUniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}-${i}`.slice(0, MAX_LEN);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`could not generate unique slug for ${base}`);
}
