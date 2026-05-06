import { LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth, signOut } from './useAuth';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { fetchBilling } from '@/lib/data/billing';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function AccountCard() {
  const { state } = useAuth();
  const user = state?.user;
  const wsId = useActiveWorkspaceId();
  const valid = !!wsId && UUID_RE.test(wsId) && state?.status === 'authenticated';

  const { data: billing } = useQuery({
    queryKey: ['billing', wsId],
    queryFn: () => fetchBilling(wsId!),
    enabled: valid
  });

  const planLabel = billing?.plan === 'pro' ? 'Pro' : 'Free';
  const planVariant: 'success' | 'secondary' = billing?.plan === 'pro' ? 'success' : 'secondary';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          {user ? <>Signed in as <span className="font-medium">{user.email ?? user.id}</span></> : 'Not signed in.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase text-muted-foreground">Active workspace plan</span>
          <Badge variant={planVariant}>{planLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            (plan is per-workspace — Billing tab shows the full picture)
          </span>
        </div>
        {user && (
          <Button variant="outline" onClick={() => { void signOut(); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
