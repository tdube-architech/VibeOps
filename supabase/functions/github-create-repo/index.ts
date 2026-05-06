/**
 * github-create-repo edge function
 *
 * Creates a new GitHub repository under the caller's account or chosen org.
 * Uses the caller's PAT from user_github_credentials.
 *
 * Input:
 *  - name              (required) repo name slug
 *  - description       (optional)
 *  - private           (default false)
 *  - org               (optional) GitHub org login; if omitted, repo lives
 *                      on the caller's user namespace.
 *  - autoInit          (default true) initialize with README
 *  - gitignoreTemplate (default 'Node')
 *
 * Returns: { ok, repoUrl, htmlUrl, defaultBranch, owner, name }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CreateInput {
  name: string;
  description?: string;
  private?: boolean;
  org?: string;
  autoInit?: boolean;
  gitignoreTemplate?: string;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST required', { status: 405 });
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing Authorization' }, 401);

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: authHeader } }
  });
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) return json({ error: 'invalid token' }, 401);
  const callerId = userResp.user.id;

  let body: CreateInput;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (!body.name) return json({ error: 'name required' }, 400);

  const { data: creds } = await adminClient
    .from('user_github_credentials')
    .select('encrypted_pat, github_username')
    .eq('user_id', callerId)
    .maybeSingle();
  if (!creds?.encrypted_pat) {
    return json({ error: 'You have not connected GitHub. Settings → Integrations.' }, 400);
  }

  const url = body.org
    ? `https://api.github.com/orgs/${encodeURIComponent(body.org)}/repos`
    : 'https://api.github.com/user/repos';

  const ghBody: Record<string, unknown> = {
    name: body.name,
    description: body.description ?? null,
    private: body.private ?? false,
    auto_init: body.autoInit ?? true
  };
  if (body.gitignoreTemplate) ghBody.gitignore_template = body.gitignoreTemplate;

  const ghRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.encrypted_pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'content-type': 'application/json'
    },
    body: JSON.stringify(ghBody)
  });

  if (ghRes.status >= 400) {
    const text = await ghRes.text();
    return json({ error: `github ${ghRes.status}`, detail: text.slice(0, 500) }, 502);
  }

  const repo = await ghRes.json();
  return json({
    ok: true,
    repoUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    owner: repo.owner?.login,
    name: repo.name
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
