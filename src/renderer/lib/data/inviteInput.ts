/**
 * Decide whether the user typed an email address or a GitHub handle in the
 * invite input. Centralized so tests can pin the behavior and the UI never
 * silently misroutes.
 *
 * Rules (ordered):
 *  - Empty / whitespace → returns null.
 *  - Starts with `@` → strip and treat as GitHub handle.
 *  - Contains `@` AND `.` → treat as email (must look like one).
 *  - Otherwise → treat as GitHub handle.
 */
export interface InviteTarget { email?: string; githubUsername?: string }

const GITHUB_HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;

export function interpretInviteInput(raw: string): InviteTarget | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const handle = trimmed.slice(1).trim();
    if (!handle) return null;
    if (!GITHUB_HANDLE_RE.test(handle)) return null;
    return { githubUsername: handle.toLowerCase() };
  }

  if (trimmed.includes('@') && trimmed.includes('.')) {
    return { email: trimmed.toLowerCase() };
  }

  // Bare token — must look like a github handle.
  if (!GITHUB_HANDLE_RE.test(trimmed)) return null;
  return { githubUsername: trimmed.toLowerCase() };
}

export function describeTarget(t: InviteTarget): string {
  if (t.email) return t.email;
  if (t.githubUsername) return `@${t.githubUsername}`;
  return '';
}
