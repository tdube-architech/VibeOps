/**
 * github-list-orgs edge function
 *
 * Returns the list of GitHub orgs the caller belongs to (so the new project
 * wizard can offer a namespace picker). Uses the caller's PAT.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

  const { data: creds } = await adminClient
    .from('user_github_credentials')
    .select('encrypted_pat, github_username')
    .eq('user_id', userResp.user.id)
    .maybeSingle();
  if (!creds?.encrypted_pat) {
    return json({ ok: true, orgs: [], username: creds?.github_username ?? null }, 200);
  }

  const ghRes = await fetch('https://api.github.com/user/orgs?per_page=100', {
    headers: {
      Authorization: `Bearer ${creds.encrypted_pat}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (ghRes.status >= 400) {
    const text = await ghRes.text();
    return json({ error: `github ${ghRes.status}`, detail: text.slice(0, 500) }, 502);
  }

  const orgs = await ghRes.json() as Array<{ login: string; avatar_url: string }>;
  return json({
    ok: true,
    username: creds.github_username,
    orgs: orgs.map((o) => ({ login: o.login, avatarUrl: o.avatar_url }))
  }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
