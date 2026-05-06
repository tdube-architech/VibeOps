// deno-lint-ignore-file no-explicit-any
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia' as any
});

const APP_RETURN_URL = Deno.env.get('APP_RETURN_URL') ?? 'vibeops://billing/return';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'missing bearer' }, 401);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: 'not signed in' }, 401);

    const { workspaceId } = (await req.json()) as { workspaceId: string };
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id, owner_id, stripe_customer_id')
      .eq('id', workspaceId)
      .single();
    if (!ws) return json({ error: 'workspace not found' }, 404);
    if (ws.owner_id !== userData.user.id) return json({ error: 'owner only' }, 403);
    if (!ws.stripe_customer_id) return json({ error: 'no stripe customer; subscribe first' }, 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: ws.stripe_customer_id,
      return_url: APP_RETURN_URL
    });
    return json({ url: session.url });
  } catch (e) {
    console.error('create-billing-portal', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
