// deno-lint-ignore-file no-explicit-any
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-12-18.acacia' as any
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Use service role so we can update workspaces regardless of RLS context.
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature') ?? '';
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, WEBHOOK_SECRET);
  } catch (e) {
    console.error('webhook signature failed', e);
    return new Response('bad signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object as Stripe.Checkout.Session;
        const wsId = sess.metadata?.workspace_id;
        if (wsId && sess.subscription && sess.customer) {
          await admin.from('workspaces').update({
            stripe_customer_id: typeof sess.customer === 'string' ? sess.customer : sess.customer.id,
            stripe_subscription_id: typeof sess.subscription === 'string' ? sess.subscription : sess.subscription.id,
            plan: 'pro',
            subscription_status: 'active'
          }).eq('id', wsId);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const wsId = sub.metadata?.workspace_id;
        if (!wsId) break;
        const seats = sub.items.data[0]?.quantity ?? 5;
        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        await admin.from('workspaces').update({
          stripe_subscription_id: sub.id,
          subscription_status: sub.status as any,
          plan: ['active', 'trialing', 'past_due'].includes(sub.status) ? 'pro' : 'free',
          member_seats: ['active', 'trialing'].includes(sub.status) ? Math.max(seats, 5) : 5,
          current_period_end: periodEnd
        }).eq('id', wsId);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const wsId = sub.metadata?.workspace_id;
        if (!wsId) break;
        await admin.from('workspaces').update({
          subscription_status: 'canceled',
          plan: 'free',
          member_seats: 5,
          stripe_subscription_id: null
        }).eq('id', wsId);
        break;
      }
      default:
        // ignore
        break;
    }
  } catch (e) {
    console.error('webhook handler', event.type, e);
    return new Response('handler error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
});
