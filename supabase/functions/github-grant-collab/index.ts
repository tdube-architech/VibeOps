/**
 * github-grant-collab edge function
 *
 * Adds a workspace member as a collaborator on the GitHub repo for a given
 * project. Called by the renderer after invitation acceptance and from the
 * "Grant access" button in WorkspaceMembersCard.
 *
 * Auth model:
 * - Caller provides their Supabase JWT in Authorization header.
 * - Function validates caller is a member of the project's workspace.
 * - Function loads the workspace owner's PAT from user_github_credentials
 *   (never exposed to clients).
 * - Function loads the target member's github_username.
 * - Function calls GitHub: PUT /repos/{owner}/{repo}/collaborators/{username}.
 * - Function records result in project_grants.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface GrantInput {
  projectId: string;
  memberUserId?: string;
}

interface GrantResult {
  ok: boolean;
  status?: 'granted' | 'invited' | 'already-collaborator';
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing Authorization' }), { status: 401 });
  }

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) {
    return json({ error: 'invalid token' }, 401);
  }
  const callerId = userResp.user.id;

  let body: GrantInput;
  try { body = await req.json(); }
  catch { return json({ error: 'invalid json' }, 400); }

  if (!body.projectId) return json({ error: 'projectId required' }, 400);
  const targetUserId = body.memberUserId ?? callerId;

  const { data: project, error: projErr } = await adminClient
    .from('projects')
    .select('id, workspace_id, repo_url')
    .eq('id', body.projectId)
    .maybeSingle();
  if (projErr || !project) return json({ error: 'project not found' }, 404);
  if (!project.repo_url) return json({ error: 'project has no repo_url set' }, 400);

  const { count: callerMember } = await adminClient
    .from('workspace_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('workspace_id', project.workspace_id)
    .eq('user_id', callerId);
  if (!callerMember) return json({ error: 'not a workspace member' }, 403);

  if (targetUserId !== callerId) {
    const { data: owner } = await adminClient
      .from('workspaces')
      .select('owner_user_id')
      .eq('id', project.workspace_id)
      .maybeSingle();
    if (!owner || owner.owner_user_id !== callerId) {
      return json({ error: 'only the workspace owner can grant for other members' }, 403);
    }
  }

  const { count: targetMember } = await adminClient
    .from('workspace_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('workspace_id', project.workspace_id)
    .eq('user_id', targetUserId);
  if (!targetMember) return json({ error: 'target user is not a workspace member' }, 400);

  const { data: ws } = await adminClient
    .from('workspaces')
    .select('owner_user_id')
    .eq('id', project.workspace_id)
    .maybeSingle();
  if (!ws) return json({ error: 'workspace not found' }, 404);

  const { data: ownerCreds } = await adminClient
    .from('user_github_credentials')
    .select('encrypted_pat')
    .eq('user_id', ws.owner_user_id)
    .maybeSingle();
  if (!ownerCreds?.encrypted_pat) {
    await recordGrant(adminClient, {
      projectId: project.id,
      workspaceId: project.workspace_id,
      memberUserId: targetUserId,
      githubUsername: '',
      status: 'failed',
      errorMessage: 'workspace owner has not connected GitHub'
    });
    return json({ error: 'workspace owner has not connected GitHub' }, 400);
  }

  // Resolve the target's GitHub username. Order:
  //   1. user_github_credentials.github_username (set when the invitee
  //      signed into VibeOps via GitHub OAuth).
  //   2. profiles fallback (in case credentials row hasn't synced yet).
  //   3. invitations.invitee_github_username — if the inviter targeted
  //      this workspace member by GitHub handle, we already know it
  //      regardless of whether the invitee has linked GitHub themselves.
  let targetGithubUsername: string | null = null;
  const { data: targetCreds } = await adminClient
    .from('user_github_credentials')
    .select('github_username')
    .eq('user_id', targetUserId)
    .maybeSingle();
  if (targetCreds?.github_username) {
    targetGithubUsername = targetCreds.github_username;
  } else {
    const { data: invRow } = await adminClient
      .from('invitations')
      .select('invitee_github_username')
      .eq('workspace_id', project.workspace_id)
      .eq('accepted_by', targetUserId)
      .not('invitee_github_username', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (invRow?.invitee_github_username) {
      targetGithubUsername = invRow.invitee_github_username;
      // Backfill user_github_credentials so future grants don't need this fallback.
      await adminClient.from('user_github_credentials').upsert({
        user_id: targetUserId,
        github_username: targetGithubUsername,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }
  }
  if (!targetGithubUsername) {
    await recordGrant(adminClient, {
      projectId: project.id,
      workspaceId: project.workspace_id,
      memberUserId: targetUserId,
      githubUsername: '',
      status: 'failed',
      errorMessage: 'target member has no linked GitHub username'
    });
    return json({ error: 'target member has no linked GitHub username — they need to sign in to VibeOps via GitHub once' }, 400);
  }

  const parsed = parseGitHubRepo(project.repo_url);
  if (!parsed) {
    return json({ error: `cannot parse GitHub owner/repo from ${project.repo_url}` }, 400);
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/collaborators/${targetGithubUsername}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${ownerCreds.encrypted_pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ permission: 'push' })
    }
  );

  let outcome: 'granted' | 'invited' | 'already-collaborator';
  if (ghRes.status === 201) outcome = 'invited';
  else if (ghRes.status === 204) outcome = 'already-collaborator';
  else if (ghRes.status === 200) outcome = 'granted';
  else {
    const errBody = await ghRes.text();
    await recordGrant(adminClient, {
      projectId: project.id,
      workspaceId: project.workspace_id,
      memberUserId: targetUserId,
      githubUsername: targetGithubUsername,
      status: 'failed',
      errorMessage: `github ${ghRes.status}: ${errBody.slice(0, 500)}`
    });
    return json({ error: `github api ${ghRes.status}`, detail: errBody }, 502);
  }

  await recordGrant(adminClient, {
    projectId: project.id,
    workspaceId: project.workspace_id,
    memberUserId: targetUserId,
    githubUsername: targetGithubUsername,
    status: 'granted'
  });

  const result: GrantResult = { ok: true, status: outcome };
  return json(result, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

interface GrantRecord {
  projectId: string;
  workspaceId: string;
  memberUserId: string;
  githubUsername: string;
  status: 'granted' | 'failed';
  errorMessage?: string;
}

async function recordGrant(client: ReturnType<typeof createClient>, g: GrantRecord) {
  const update: Record<string, unknown> = {
    project_id: g.projectId,
    workspace_id: g.workspaceId,
    member_user_id: g.memberUserId,
    github_username: g.githubUsername,
    status: g.status,
    error_message: g.errorMessage ?? null,
    updated_at: new Date().toISOString()
  };
  if (g.status === 'granted') update.granted_at = new Date().toISOString();

  await client.from('project_grants').upsert(update, {
    onConflict: 'project_id,member_user_id'
  });
}

function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } | null {
  const url = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const sshMatch = url.match(/^git@github\.com:(.+)\/(.+)$/i);
  if (sshMatch && sshMatch[1] && sshMatch[2]) return { owner: sshMatch[1], repo: sshMatch[2] };
  const httpsMatch = url.match(/^https?:\/\/github\.com\/(.+?)\/(.+)$/i);
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return null;
}
