// deno-lint-ignore-file no-explicit-any
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia' as any
});

const PRICE_PRO_MONTHLY = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')!;
const PRICE_PRO_ANNUAL = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL')!;
const APP_RETURN_URL = Deno.env.get('APP_RETURN_URL') ?? 'vibeops://billing/return';

interface RequestBody {
  workspaceId: string;
  plan: 'monthly' | 'annual';
  initialSeats?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) {
      return json({ error: 'missing bearer token' }, 401);
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: 'not signed in' }, 401);

    const body = (await req.json()) as RequestBody;
    if (!body.workspaceId) return json({ error: 'workspaceId required' }, 400);

    const { data: ws, error: wsErr } = await supabase
      .from('workspaces')
      .select('id, name, owner_id, stripe_customer_id, plan')
      .eq('id', body.workspaceId)
      .single();
    if (wsErr || !ws) return json({ error: 'workspace not found' }, 404);
    if (ws.owner_id !== userData.user.id) return json({ error: 'owner only' }, 403);

    let customerId = ws.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData.user.email ?? undefined,
        name: ws.name,
        metadata: { workspace_id: ws.id, user_id: userData.user.id }
      });
      customerId = customer.id;
      await supabase.from('workspaces').update({ stripe_customer_id: customerId }).eq('id', ws.id);
    }

    const priceId = body.plan === 'annual' ? PRICE_PRO_ANNUAL : PRICE_PRO_MONTHLY;
    const seatQty = Math.max(1, body.initialSeats ?? 5);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: seatQty }],
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
      success_url: `${APP_RETURN_URL}?session=success`,
      cancel_url: `${APP_RETURN_URL}?session=cancel`,
      subscription_data: {
        metadata: { workspace_id: ws.id }
      },
      metadata: { workspace_id: ws.id }
    });

    return json({ url: session.url });
  } catch (e) {
    console.error('create-checkout-session', e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
