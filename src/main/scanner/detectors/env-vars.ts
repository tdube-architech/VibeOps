export interface ExtractedEnvVar {
  filename: string;
  variable: string;
  required: boolean;
  comment: string | null;
}

const KEY_RE = /^([A-Z][A-Z0-9_]*)\s*=/;

export function extractEnvVarNames(filename: string, content: string): ExtractedEnvVar[] {
  const out: ExtractedEnvVar[] = [];
  const lines = content.split(/\r?\n/);
  let pendingComment: string | null = null;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      pendingComment = null;
      continue;
    }
    if (trimmed.startsWith('#')) {
      pendingComment = trimmed.replace(/^#+\s?/, '').trim() || null;
      continue;
    }
    const m = KEY_RE.exec(trimmed);
    if (!m) {
      pendingComment = null;
      continue;
    }
    const variable = m[1]!;
    const required = !variable.startsWith('NEXT_PUBLIC_') && !variable.startsWith('VITE_');
    out.push({ filename, variable, required, comment: pendingComment });
    pendingComment = null;
  }
  return out;
}
