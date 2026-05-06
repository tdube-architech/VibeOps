/**
 * github-check-repo edge function
 *
 * Looks up whether a repo already exists at <owner>/<name> using the
 * caller's PAT. Used by NewProjectWizard to surface name collisions before
 * submit so the user can either rename or adopt the existing repo.
 *
 * Input: { name: string, org?: string }
 *   - org omitted → caller's GitHub username is used as owner.
 *
 * Output: { ok: true, exists: false }
 *      or { ok: true, exists: true, owner, name, cloneUrl, htmlUrl,
 *            defaultBranch, private }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CheckInput {
  name: string;
  org?: string;
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

  let body: CheckInput;
  try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
  if (!body.name) return json({ error: 'name required' }, 400);

  const { data: creds } = await adminClient
    .from('user_github_credentials')
    .select('encrypted_pat, github_username')
    .eq('user_id', userResp.user.id)
    .maybeSingle();
  if (!creds?.encrypted_pat) {
    return json({ error: 'GitHub not connected' }, 400);
  }
  const owner = body.org ?? creds.github_username;
  if (!owner) return json({ error: 'no namespace available — set GitHub username' }, 400);

  const ghRes = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(body.name)}`,
    {
      headers: {
        Authorization: `Bearer ${creds.encrypted_pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
  );

  if (ghRes.status === 404) {
    return json({ ok: true, exists: false, owner, name: body.name }, 200);
  }
  if (ghRes.status >= 400) {
    const text = await ghRes.text();
    return json({ error: `github ${ghRes.status}`, detail: text.slice(0, 500) }, 502);
  }

  const repo = await ghRes.json();
  return json({
    ok: true,
    exists: true,
    owner: repo.owner?.login ?? owner,
    name: repo.name,
    cloneUrl: repo.clone_url,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    private: repo.private
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
