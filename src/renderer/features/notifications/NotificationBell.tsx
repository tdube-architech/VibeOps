import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/useAuth';
import { toast } from '@/lib/toast';
import {
  deleteNotification, listNotifications, markAllRead, markNotificationRead,
  type Notification
} from '@/lib/data/notifications';
import { acceptInvitationByToken, declineInvitationByToken } from '@/lib/data/members';

const KEY = ['notifications'] as const;

function formatRelative(iso: string): string {
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

export function NotificationBell() {
  const { state } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { data: notifications = [] } = useQuery({
    queryKey: KEY,
    queryFn: () => listNotifications(),
    enabled: state?.status === 'authenticated'
  });

  const unread = notifications.filter((n) => n.readAt === null);
  const unreadCount = unread.length;

  // realtime subscription
  useEffect(() => {
    if (state?.status !== 'authenticated' || !state.user) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`notifications:${state.user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.user.id}` },
        (msg) => {
          const row = msg.new as { title: string; body: string | null };
          toast.info(row.title, row.body ?? '');
          qc.invalidateQueries({ queryKey: KEY });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.user.id}` },
        () => qc.invalidateQueries({ queryKey: KEY })
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.user.id}` },
        () => qc.invalidateQueries({ queryKey: KEY })
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [state?.status, state?.user?.id, qc]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (state?.status !== 'authenticated') return null;

  async function onClickItem(n: Notification) {
    if (!n.readAt) {
      try { await markNotificationRead(n.id); } catch { /* soft-fail */ }
      qc.invalidateQueries({ queryKey: KEY });
    }
    if (n.link?.startsWith('#/')) {
      navigate(n.link.slice(1));
      setOpen(false);
    }
  }

  async function onMarkAll() {
    try { await markAllRead(); } catch (e) { toast.error('Failed', (e as Error).message); }
    qc.invalidateQueries({ queryKey: KEY });
  }

  async function onDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try { await deleteNotification(id); } catch { /* soft-fail */ }
    qc.invalidateQueries({ queryKey: KEY });
  }

  async function onAcceptInvite(e: React.MouseEvent, n: Notification) {
    e.stopPropagation();
    const token = (n.payload?.['token'] as string | undefined) ?? null;
    if (!token) { toast.error('Invite missing token'); return; }
    try {
      await acceptInvitationByToken(token);
      toast.success('Joined workspace');
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['workspaces'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    } catch (err) {
      toast.error('Could not accept invite', (err as Error).message);
    }
  }

  async function onDeclineInvite(e: React.MouseEvent, n: Notification) {
    e.stopPropagation();
    const token = (n.payload?.['token'] as string | undefined) ?? null;
    if (!token) { toast.error('Invite missing token'); return; }
    try {
      await declineInvitationByToken(token);
      toast.info('Invite declined');
      qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toast.error('Could not decline invite', (err as Error).message);
    }
  }

  return (
    <div className="relative" ref={dropdownRef} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-7 w-7 place-items-center rounded-md text-white hover:bg-white/10"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-96 max-h-[480px] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={onMarkAll} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  onClick={() => void onClickItem(n)}
                  className={`group cursor-pointer px-3 py-2 hover:bg-secondary/40 ${
                    n.readAt ? '' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                        <span className="text-sm font-medium truncate">{n.title}</span>
                      </div>
                      {n.body && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                      )}
                      <div className="mt-1 text-[10px] text-muted-foreground">{formatRelative(n.createdAt)}</div>
                      {n.type === 'workspace.invitation_pending' && !n.readAt && (
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={(e) => void onAcceptInvite(e, n)}
                            className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Accept
                          </button>
                          <button
                            onClick={(e) => void onDeclineInvite(e, n)}
                            className="rounded border border-border px-2 py-1 text-xs hover:bg-secondary/40"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => void onDismiss(e, n.id)}
                      className="invisible rounded p-1 hover:bg-destructive/20 group-hover:visible"
                      title="Dismiss"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
