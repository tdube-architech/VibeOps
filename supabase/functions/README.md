# Edge Functions

Deno functions deployed via Supabase CLI. Used for Stripe checkout/portal/webhook.

## One-time Stripe setup

1. Create Stripe account: https://dashboard.stripe.com.
2. **Products → Add product:**
   - Name: `VibeOps Pro`
   - Pricing model: **Recurring**
   - Add **two prices**:
     - **Monthly:** $25 / month / per unit (quantity = seats)
     - **Annual:** $240 / year / per unit
   - Save and copy each price's `price_id` (`price_xxxxx`).
3. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Save and copy the **Signing secret** (`whsec_...`).
4. **Developers → API keys** → copy the **Secret key** (`sk_live_...` or `sk_test_...`).

## Set Supabase secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_xxx \
  STRIPE_WEBHOOK_SECRET=whsec_xxx \
  STRIPE_PRICE_PRO_MONTHLY=price_xxx \
  STRIPE_PRICE_PRO_ANNUAL=price_xxx \
  APP_RETURN_URL=vibeops://billing/return
```

## Deploy

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-billing-portal
supabase functions deploy stripe-webhook
```

For local development:
```bash
supabase functions serve --env-file .env.local
```

## Function summary

- **create-checkout-session** — owner-only. Creates a Stripe Checkout Session and returns its hosted URL. App opens it in the system browser. Auto-creates the `stripe_customer_id` on the workspace if missing.
- **create-billing-portal** — owner-only. Returns a Stripe Customer Portal URL for managing subscription, payment methods, cancellation.
- **stripe-webhook** — Stripe → Supabase. Handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`. Updates `workspaces.{plan, subscription_status, member_seats, current_period_end}` via service-role.
