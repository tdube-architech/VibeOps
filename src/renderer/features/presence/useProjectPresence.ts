import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/useAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PresenceUser {
  userId: string;
  email: string;
  displayName: string | null;
  joinedAt: number;
}

interface PresencePayload {
  user_id: string;
  email: string;
  display_name: string | null;
  joined_at: number;
}

/**
 * Track who else is currently viewing this project.
 * Returns the list of co-viewers (excluding self).
 */
export function useProjectPresence(projectId: string | undefined): PresenceUser[] {
  const { state } = useAuth();
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!projectId || !UUID_RE.test(projectId) || state?.status !== 'authenticated' || !state.user) {
      setOthers([]);
      return;
    }
    const supabase = getSupabase();
    const myId = state.user.id;
    const myEmail = state.user.email ?? '';

    const channel = supabase.channel(`presence:project:${projectId}`, {
      config: { presence: { key: myId } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const stateMap = channel.presenceState() as Record<string, PresencePayload[]>;
        const list: PresenceUser[] = [];
        for (const [_, entries] of Object.entries(stateMap)) {
          for (const e of entries) {
            if (e.user_id === myId) continue;
            list.push({
              userId: e.user_id,
              email: e.email,
              displayName: e.display_name,
              joinedAt: e.joined_at
            });
          }
        }
        setOthers(list);
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return;
        await channel.track({
          user_id: myId,
          email: myEmail,
          display_name: myEmail.split('@')[0] ?? null,
          joined_at: Date.now()
        } satisfies PresencePayload);
      });

    return () => { void supabase.removeChannel(channel); };
  }, [projectId, state?.status, state?.user?.id, state?.user?.email]);

  return others;
}
