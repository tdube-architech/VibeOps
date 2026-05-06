import { getSupabase } from '@/lib/supabase';

export type PlanTier = 'free' | 'pro';
export type SubscriptionStatus =
  | 'none' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete';

export interface WorkspaceBilling {
  workspaceId: string;
  plan: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  memberSeats: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
  isOwner: boolean;
}

interface Row {
  workspace_id: string;
  plan: PlanTier;
  subscription_status: SubscriptionStatus;
  member_seats: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
  member_count: number;
  is_owner: boolean;
}

function rowToBilling(r: Row): WorkspaceBilling {
  return {
    workspaceId: r.workspace_id,
    plan: r.plan,
    subscriptionStatus: r.subscription_status,
    memberSeats: r.member_seats,
    trialEndsAt: r.trial_ends_at,
    currentPeriodEnd: r.current_period_end,
    memberCount: r.member_count,
    isOwner: r.is_owner
  };
}

export async function fetchBilling(workspaceId: string): Promise<WorkspaceBilling | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('workspace_billing', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
  const row = (data as Row[] | null)?.[0];
  return row ? rowToBilling(row) : null;
}

export async function startTrial(workspaceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('start_trial', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
}

async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}

export async function startCheckout(
  workspaceId: string, plan: 'monthly' | 'annual', initialSeats?: number
): Promise<{ url: string }> {
  return invokeFunction<{ url: string }>('create-checkout-session', {
    workspaceId, plan, initialSeats
  });
}

export async function openBillingPortal(workspaceId: string): Promise<{ url: string }> {
  return invokeFunction<{ url: string }>('create-billing-portal', { workspaceId });
}

export async function devGrantPro(workspaceId: string, seats = 1000): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('dev_grant_pro', { ws_id: workspaceId, seats });
  if (error) throw new Error(error.message);
}

export async function devRevokePro(workspaceId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('dev_revoke_pro', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
}

export function isBillingBypassEnabled(): boolean {
  return import.meta.env.RENDERER_VITE_DEV_BILLING_BYPASS === '1';
}
