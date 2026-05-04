function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = sortObjectKeys(obj[key]);
  }
  return out;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortObjectKeys(value));
}
