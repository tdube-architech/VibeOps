import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Sparkles, Timer } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  devGrantPro, devRevokePro,
  fetchBilling, isBillingBypassEnabled, openBillingPortal, startCheckout, startTrial,
  type WorkspaceBilling
} from '@/lib/data/billing';
import { listMyConcurrentActiveCount, endAllMyActiveSessions } from '@/lib/data/aiSessions';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function statusBadge(b: WorkspaceBilling): React.ReactNode {
  if (b.plan === 'free') return <Badge variant="secondary">Free</Badge>;
  switch (b.subscriptionStatus) {
    case 'trialing':
      return <Badge variant="warning"><Timer className="h-3 w-3" /> Pro trial</Badge>;
    case 'active':
      return <Badge variant="success"><Sparkles className="h-3 w-3" /> Pro</Badge>;
    case 'past_due':
      return <Badge variant="destructive">Pro · past due</Badge>;
    case 'canceled':
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{b.subscriptionStatus}</Badge>;
  }
}

export function BillingCard() {
  const wsId = useActiveWorkspaceId();
  const { state } = useAuth();
  const qc = useQueryClient();
  const valid = !!wsId && UUID_RE.test(wsId) && state?.status === 'authenticated';

  const { data: billing, isLoading } = useQuery({
    queryKey: ['billing', wsId],
    queryFn: () => fetchBilling(wsId!),
    enabled: valid
  });

  const { data: aiActiveCount } = useQuery({
    queryKey: ['ai-sessions', 'my-active-count'],
    queryFn: listMyConcurrentActiveCount,
    enabled: valid,
    refetchInterval: 30_000
  });

  const trial = useMutation({
    mutationFn: () => startTrial(wsId!),
    onSuccess: () => {
      toast.success('7-day Pro trial started');
      qc.invalidateQueries({ queryKey: ['billing', wsId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (e) => toast.error('Could not start trial', (e as Error).message)
  });

  const checkout = useMutation({
    mutationFn: (plan: 'monthly' | 'annual') => startCheckout(wsId!, plan),
    onSuccess: async ({ url }) => { if (url) await api.auth.openExternal(url); },
    onError: (e) => toast.error('Checkout failed', (e as Error).message)
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(wsId!),
    onSuccess: async ({ url }) => { if (url) await api.auth.openExternal(url); },
    onError: (e) => toast.error('Could not open portal', (e as Error).message)
  });
  const grantPro = useMutation({
    mutationFn: () => devGrantPro(wsId!),
    onSuccess: () => {
      toast.success('Dev: Pro granted', 'Workspace flipped to Pro for testing.');
      qc.invalidateQueries({ queryKey: ['billing', wsId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (e) => toast.error('Dev grant failed', (e as Error).message)
  });
  const revokePro = useMutation({
    mutationFn: () => devRevokePro(wsId!),
    onSuccess: () => {
      toast.info('Dev: reverted to Free');
      qc.invalidateQueries({ queryKey: ['billing', wsId] });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
    }
  });

  if (!valid) return null;

  const trialDaysLeft = daysUntil(billing?.trialEndsAt ?? null);
  const renewalDaysLeft = daysUntil(billing?.currentPeriodEnd ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> Billing &amp; Plan
        </CardTitle>
        <CardDescription>
          Free: 5 members per workspace. Pro: $25/seat/mo or $240/seat/yr — unlimited members,
          unlimited audit history, custom roles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading || !billing ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs uppercase text-muted-foreground">Plan</span>
              {statusBadge(billing)}
              <span className="text-xs text-muted-foreground">
                {billing.memberCount} of {billing.plan === 'pro' && billing.memberSeats > 5 ? billing.memberSeats : 5} seats used
              </span>
              <span className="text-xs text-muted-foreground">
                · {aiActiveCount ?? 0} of {billing.plan === 'pro' ? 5 : 1} AI session{billing.plan === 'pro' ? 's' : ''} active
              </span>
              {(aiActiveCount ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={async () => {
                    const n = await endAllMyActiveSessions(0);
                    toast.success(`Ended ${n} stuck session${n === 1 ? '' : 's'}`);
                    qc.invalidateQueries({ queryKey: ['ai-sessions'] });
                  }}
                >
                  Reset stuck
                </Button>
              )}
            </div>

            {billing.subscriptionStatus === 'trialing' && trialDaysLeft !== null && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                Trial ends in <span className="font-semibold">{Math.max(trialDaysLeft, 0)} day{trialDaysLeft === 1 ? '' : 's'}</span>.
                Upgrade now to keep Pro features.
              </div>
            )}
            {billing.subscriptionStatus === 'active' && renewalDaysLeft !== null && (
              <div className="text-xs text-muted-foreground">
                Renews in {Math.max(renewalDaysLeft, 0)} day{renewalDaysLeft === 1 ? '' : 's'}.
              </div>
            )}
            {billing.subscriptionStatus === 'past_due' && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                Last payment failed. Update billing details to keep Pro features.
              </div>
            )}

            {billing.isOwner ? (
              <div className="flex flex-wrap gap-2">
                {billing.plan === 'free' && billing.trialEndsAt === null && (
                  <Button variant="outline" onClick={() => trial.mutate()} disabled={trial.isPending}>
                    <Timer className="h-4 w-4" /> Start 7-day Pro trial
                  </Button>
                )}
                {billing.plan !== 'pro' || billing.subscriptionStatus !== 'active' ? (
                  <>
                    <Button onClick={() => checkout.mutate('monthly')} disabled={checkout.isPending}>
                      <Sparkles className="h-4 w-4" /> Upgrade to Pro · $25/seat/mo
                    </Button>
                    <Button variant="outline" onClick={() => checkout.mutate('annual')} disabled={checkout.isPending}>
                      Annual · $240/seat/yr (save 20%)
                    </Button>
                  </>
                ) : null}
                {billing.subscriptionStatus === 'active' || billing.subscriptionStatus === 'past_due' ? (
                  <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
                    Manage subscription
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Only the workspace owner can manage billing.
              </div>
            )}
            {isBillingBypassEnabled() && billing.isOwner && (
              <div className="rounded-md border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
                <div className="text-xs font-medium text-amber-500">Dev override</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Stripe not wired yet. Use these to flip your workspace state for testing.
                </div>
                <div className="mt-2 flex gap-2">
                  {billing.plan === 'free' || billing.subscriptionStatus !== 'active' ? (
                    <Button size="sm" variant="outline" onClick={() => grantPro.mutate()} disabled={grantPro.isPending}>
                      Grant Pro (1000 seats)
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => revokePro.mutate()} disabled={revokePro.isPending}>
                      Revert to Free
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
