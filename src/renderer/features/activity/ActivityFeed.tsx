import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabase } from '@/lib/supabase';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';

interface ActivityRow {
  id: string;
  workspace_id: string;
  actor_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface ActivityWithProfile extends ActivityRow {
  actor_email: string | null;
  actor_display_name: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function describe(row: ActivityWithProfile): string {
  const actor = row.actor_display_name ?? row.actor_email?.split('@')[0] ?? 'Someone';
  switch (row.action) {
    case 'invitation.created': {
      const email = (row.payload as { email?: string } | null)?.email;
      return `${actor} invited ${email ?? 'someone'} to the workspace`;
    }
    case 'invitation.accepted': {
      const role = (row.payload as { role?: string } | null)?.role;
      return `${actor} joined the workspace as ${role ?? 'member'}`;
    }
    default:
      return `${actor} ${row.action.replace(/\./g, ' ')}`;
  }
}

async function fetchActivity(workspaceId: string): Promise<ActivityWithProfile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ActivityRow[];
  if (rows.length === 0) return [];

  const userIds = [...new Set(rows.map((r) => r.actor_user_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, email, display_name')
    .in('user_id', userIds);
  const byId = new Map((profiles ?? []).map((p) => [p.user_id as string, p as { user_id: string; email: string; display_name: string | null }]));

  return rows.map((r) => ({
    ...r,
    actor_email: byId.get(r.actor_user_id)?.email ?? null,
    actor_display_name: byId.get(r.actor_user_id)?.display_name ?? null
  }));
}

export function ActivityFeed() {
  const wsId = useActiveWorkspaceId();
  const { state } = useAuth();
  const qc = useQueryClient();
  const valid = !!wsId && UUID_RE.test(wsId) && state?.status === 'authenticated';

  const { data: items = [] } = useQuery({
    queryKey: ['activity', wsId],
    queryFn: () => fetchActivity(wsId!),
    enabled: valid
  });

  useEffect(() => {
    if (!valid) return;
    const supabase = getSupabase();
    const ch = supabase
      .channel(`activity-${wsId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `workspace_id=eq.${wsId}` },
        () => qc.invalidateQueries({ queryKey: ['activity', wsId] }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [valid, wsId, qc]);

  if (!valid) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Workspace Activity
        </CardTitle>
        <CardDescription>Recent events across this workspace.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">No activity yet.</div>
        ) : (
          <ul className="space-y-2 text-sm">
            {items.map((row) => (
              <li key={row.id} className="flex items-start gap-2 border-b border-border/40 pb-2 last:border-b-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{describe(row)}</div>
                  <div className="text-xs text-muted-foreground">{relativeTime(row.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
