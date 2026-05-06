import { getSupabase } from '@/lib/supabase';

export interface GitHubCredentials {
  githubUsername: string;
  hasPat: boolean;
  scopes: string[];
  updatedAt: string;
}

interface CredsRow {
  user_id: string;
  github_username: string;
  encrypted_pat: string | null;
  scopes: string[];
  updated_at: string;
}

export async function getMyGitHubCredentials(): Promise<GitHubCredentials | null> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from('user_github_credentials')
    .select('github_username, encrypted_pat, scopes, updated_at')
    .eq('user_id', u.user.id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Pick<CredsRow, 'github_username' | 'encrypted_pat' | 'scopes' | 'updated_at'>;
  return {
    githubUsername: row.github_username,
    hasPat: row.encrypted_pat !== null && row.encrypted_pat !== '',
    scopes: row.scopes ?? [],
    updatedAt: row.updated_at
  };
}

export async function saveMyGitHubCredentials(args: {
  githubUsername: string;
  /** Pass empty string to leave PAT unchanged. */
  pat: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const update: Record<string, unknown> = {
    user_id: u.user.id,
    github_username: args.githubUsername,
    updated_at: new Date().toISOString()
  };
  if (args.pat !== null && args.pat !== '') update.encrypted_pat = args.pat;
  const { error } = await supabase
    .from('user_github_credentials')
    .upsert(update, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/**
 * Pull GitHub username + provider access token from the active Supabase
 * session and persist them. Runs after sign-in so users never have to paste
 * a PAT — the OAuth dance Supabase already runs gives us a usable token.
 *
 * Returns true when credentials were stored. Returns false when the session
 * has no provider_token (e.g. session was restored from cache without it),
 * in which case the caller should suggest a Reconnect.
 */
export async function syncGitHubCredentialsFromSession(): Promise<boolean> {
  const supabase = getSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return false;

  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const username =
    (meta?.['user_name'] as string | undefined) ??
    (meta?.['preferred_username'] as string | undefined) ??
    null;
  const token = session.provider_token ?? null;

  if (!username) return false;

  const update: Record<string, unknown> = {
    user_id: session.user.id,
    github_username: username,
    updated_at: new Date().toISOString()
  };
  // Only overwrite the stored token when the live session actually carries
  // one — supabase-js drops provider_token from cached sessions, so we
  // mustn't blank a previously-good value when we just see a restored session.
  if (token) update.encrypted_pat = token;

  const { error } = await supabase
    .from('user_github_credentials')
    .upsert(update, { onConflict: 'user_id' });
  if (error) {
    console.warn('[github] sync from session failed', error.message);
    return false;
  }
  return Boolean(token);
}

export interface GrantResponse {
  ok: boolean;
  status?: 'granted' | 'invited' | 'already-collaborator';
  error?: string;
}

export async function grantRepoAccess(args: {
  projectId: string;
  /** Omit to grant for self (use case: post-invite-accept self-onboarding). */
  memberUserId?: string;
}): Promise<GrantResponse> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('github-grant-collab', {
    body: {
      projectId: args.projectId,
      ...(args.memberUserId !== undefined ? { memberUserId: args.memberUserId } : {})
    }
  });
  if (error) {
    return { ok: false, error: await readFunctionError(error, 'grant failed') };
  }
  return data as GrantResponse;
}

export interface ProjectGrant {
  id: string;
  projectId: string;
  workspaceId: string;
  memberUserId: string;
  githubUsername: string;
  status: 'pending' | 'granted' | 'revoked' | 'failed';
  grantedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  updatedAt: string;
}

interface GrantRow {
  id: string;
  project_id: string;
  workspace_id: string;
  member_user_id: string;
  github_username: string;
  status: 'pending' | 'granted' | 'revoked' | 'failed';
  granted_at: string | null;
  error_message: string | null;
  attempts: number;
  updated_at: string;
}

function rowToGrant(r: GrantRow): ProjectGrant {
  return {
    id: r.id,
    projectId: r.project_id,
    workspaceId: r.workspace_id,
    memberUserId: r.member_user_id,
    githubUsername: r.github_username,
    status: r.status,
    grantedAt: r.granted_at,
    errorMessage: r.error_message,
    attempts: r.attempts,
    updatedAt: r.updated_at
  };
}

export async function listGrantsForProject(projectId: string): Promise<ProjectGrant[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_grants')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as GrantRow[]).map(rowToGrant);
}

export interface WorkspaceGitHubStatus {
  userId: string;
  email: string | null;
  githubUsername: string | null;
  hasPat: boolean;
}

interface StatusRow {
  user_id: string;
  email: string | null;
  github_username: string | null;
  has_pat: boolean;
}

/**
 * Resolve a workspace member's id to a friendly label. Returns
 * "@github_username" if linked, otherwise the email, otherwise null.
 */
export function pickDisplayLabel(s: WorkspaceGitHubStatus): string {
  if (s.githubUsername) return `@${s.githubUsername}`;
  if (s.email) return s.email;
  return s.userId.slice(0, 8) + '…';
}

export async function listWorkspaceGitHubStatus(workspaceId: string): Promise<WorkspaceGitHubStatus[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('workspace_github_status', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as StatusRow[]).map((r) => ({
    userId: r.user_id,
    email: r.email,
    githubUsername: r.github_username,
    hasPat: r.has_pat
  }));
}

export interface GitHubOrg { login: string; avatarUrl: string }
export interface GitHubNamespace { username: string | null; orgs: GitHubOrg[] }

export async function listMyGitHubNamespaces(): Promise<GitHubNamespace> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('github-list-orgs', { body: {} });
  if (error) throw new Error(await readFunctionError(error, 'list-orgs failed'));
  const r = data as { username: string | null; orgs: GitHubOrg[] };
  return { username: r.username, orgs: r.orgs ?? [] };
}

export interface CreateRepoArgs {
  name: string;
  description?: string;
  private: boolean;
  /** Org login to create under, or omit for the caller's user namespace. */
  org?: string;
}

export interface CreatedRepo {
  repoUrl: string;
  htmlUrl: string;
  defaultBranch: string;
  owner: string;
  name: string;
}

async function readFunctionError(error: unknown, fallback: string): Promise<string> {
  // supabase-js v2.x wraps non-2xx in FunctionsHttpError. The Response can
  // live on `.context` (newer) or `.context.response` (some builds), so try
  // both. Default error.message is just "non-2xx status code".
  const e = error as {
    context?: Response | { response?: Response } | unknown;
    message?: string;
    name?: string;
  };
  const candidates: Response[] = [];
  if (e?.context instanceof Response) candidates.push(e.context);
  const ctx = e?.context as { response?: Response } | undefined;
  if (ctx?.response instanceof Response) candidates.push(ctx.response);

  for (const res of candidates) {
    try {
      const body = await res.clone().json();
      const obj = body as { error?: string; detail?: string; message?: string };
      const detail = obj.detail ? ` (${obj.detail.slice(0, 200)})` : '';
      const msg = obj.error ?? obj.message;
      if (msg) return `${msg}${detail}`;
    } catch { /* fall through to text */ }
    try {
      const text = await res.clone().text();
      if (text) return `${fallback} [${res.status}]: ${text.slice(0, 400)}`;
    } catch { /* ignore */ }
    return `${fallback} [${res.status}]`;
  }
  // No Response anywhere — surface the supabase error name + message.
  const name = e?.name ? `${e.name}: ` : '';
  return `${name}${e?.message ?? fallback}`;
}

export interface RepoStatus {
  exists: boolean;
  owner: string;
  name: string;
  cloneUrl?: string;
  htmlUrl?: string;
  defaultBranch?: string;
  private?: boolean;
}

export async function checkGitHubRepoExists(args: { name: string; org?: string }): Promise<RepoStatus> {
  const supabase = getSupabase();
  const body: Record<string, unknown> = { name: args.name };
  if (args.org) body.org = args.org;
  const { data, error } = await supabase.functions.invoke('github-check-repo', { body });
  if (error) throw new Error(await readFunctionError(error, 'check-repo failed'));
  return data as RepoStatus;
}

export async function createGitHubRepo(args: CreateRepoArgs): Promise<CreatedRepo> {
  const supabase = getSupabase();
  const body: Record<string, unknown> = {
    name: args.name,
    private: args.private,
    autoInit: true,
    gitignoreTemplate: 'Node'
  };
  if (args.description) body.description = args.description;
  if (args.org) body.org = args.org;
  const { data, error } = await supabase.functions.invoke('github-create-repo', { body });
  if (error) throw new Error(await readFunctionError(error, 'create-repo failed'));
  const r = data as { ok?: boolean; error?: string } & CreatedRepo;
  if (!r.ok) throw new Error(r.error ?? 'create-repo failed');
  return {
    repoUrl: r.repoUrl,
    htmlUrl: r.htmlUrl,
    defaultBranch: r.defaultBranch,
    owner: r.owner,
    name: r.name
  };
}
