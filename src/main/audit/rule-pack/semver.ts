interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;

export function parseVersion(raw: string): ParsedVersion | null {
  const cleaned = raw.replace(/^[~^=v]+/, '').trim();
  const match = VERSION_RE.exec(cleaned);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

function compare(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

interface RangeAtom {
  op: '>' | '>=' | '<' | '<=' | '=';
  version: ParsedVersion;
}

function parseAtom(raw: string): RangeAtom | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const opMatch = /^(>=|<=|>|<|=)?\s*(.+)$/.exec(trimmed);
  if (!opMatch) return null;
  const op = (opMatch[1] ?? '=') as RangeAtom['op'];
  const version = parseVersion(opMatch[2]!);
  if (!version) return null;
  return { op, version };
}

function checkAtom(version: ParsedVersion, atom: RangeAtom): boolean {
  const cmp = compare(version, atom.version);
  switch (atom.op) {
    case '>': return cmp > 0;
    case '>=': return cmp >= 0;
    case '<': return cmp < 0;
    case '<=': return cmp <= 0;
    case '=': return cmp === 0;
  }
}

export function satisfiesRange(versionRaw: string, range: string): boolean {
  const version = parseVersion(versionRaw);
  if (!version) return false;

  return range
    .split('||')
    .some((clause) =>
      clause
        .split(/\s+/)
        .map(parseAtom)
        .filter((a): a is RangeAtom => a !== null)
        .every((atom) => checkAtom(version, atom))
    );
}
