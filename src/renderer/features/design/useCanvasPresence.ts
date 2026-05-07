import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/useAuth';
import { getMyGitHubCredentials } from '@/lib/data/githubIntegration';

/**
 * Live cursor + drag presence on a design canvas.
 *
 * Channel design: opens a SEPARATE channel `design-canvas-presence-${canvasId}`
 * rather than reusing `useCanvasRealtime`'s channel. The realtime hook keys its
 * channel by both canvasId and a per-consumer `useId()` (so two consumers in
 * the same canvas don't actually share a channel), which makes `track()` /
 * `presenceState()` ambiguous. A dedicated presence channel keyed only by
 * canvasId guarantees every viewer of the same canvas joins the same room.
 */

// 10-color palette — distinct hues, decent contrast on light/dark.
// Hex without leading '#'.
const PALETTE: readonly string[] = [
  'ef4444', // red
  'f97316', // orange
  'eab308', // yellow
  '22c55e', // green
  '14b8a6', // teal
  '0ea5e9', // sky
  '6366f1', // indigo
  '8b5cf6', // violet
  'ec4899', // pink
  '64748b' // slate
];

function hashUserIdToColor(userId: string): string {
  // FNV-1a hash → palette index. Deterministic per userId.
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % PALETTE.length;
  // PALETTE has fixed length 10; idx is bounded so this is always defined,
  // but TypeScript's `noUncheckedIndexedAccess` flags it. Coerce safely.
  return PALETTE[idx] ?? PALETTE[0]!;
}

export interface PresencePeer {
  userId: string;
  label: string;
  color: string;
  x: number;
  y: number;
  draggingNodeId: string | null;
}

interface PresencePayload {
  user_id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  dragging_node_id: string | null;
  ts: number;
}

export interface UseCanvasPresenceResult {
  peers: PresencePeer[];
  setCursor: (x: number, y: number) => void;
  setDragging: (nodeId: string | null) => void;
}

const TRACK_INTERVAL_MS = 40; // ~25 fps; well within Supabase Realtime budget.

/**
 * Track this user's cursor + drag state and observe peers.
 *
 * @param canvasId Canvas id, or null/undefined to disable.
 */
export function useCanvasPresence(canvasId: string | null | undefined): UseCanvasPresenceResult {
  const { state } = useAuth();
  const [peers, setPeers] = useState<PresencePeer[]>([]);

  // Mutable local state for the user's own presence — updated cheaply by
  // setCursor / setDragging, then flushed on a throttled interval.
  const xRef = useRef(0);
  const yRef = useRef(0);
  const draggingRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);

  // Identity captured per-mount so async credential fetch can update.
  const myIdRef = useRef<string | null>(null);
  const labelRef = useRef<string>('You');
  const colorRef = useRef<string>(PALETTE[0]!);

  // Channel + flush timer kept in refs so callbacks are stable.
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null);

  const myId = state?.status === 'authenticated' ? state.user?.id ?? null : null;
  const myEmail = state?.status === 'authenticated' ? state.user?.email ?? null : null;

  useEffect(() => {
    if (!canvasId || !myId) {
      setPeers([]);
      return;
    }

    let cancelled = false;
    myIdRef.current = myId;
    colorRef.current = hashUserIdToColor(myId);
    // Initial label — replaced if github_username resolves.
    labelRef.current = myEmail ? (myEmail.split('@')[0] ?? myEmail) : myId.slice(0, 6);

    // Resolve display label asynchronously; mirrors PresenceStack/pickDisplayLabel.
    void (async () => {
      try {
        const creds = await getMyGitHubCredentials();
        if (cancelled) return;
        if (creds?.githubUsername) {
          labelRef.current = `@${creds.githubUsername}`;
          dirtyRef.current = true; // Re-flush so peers see the updated label.
        }
      } catch {
        /* ignore — fallback label is fine */
      }
    })();

    const supabase = getSupabase();
    const channel = supabase.channel(`design-canvas-presence-${canvasId}`, {
      config: { presence: { key: myId } }
    });
    channelRef.current = channel;

    const recomputePeers = (): void => {
      const stateMap = channel.presenceState() as Record<string, PresencePayload[]>;
      const next: PresencePeer[] = [];
      for (const entries of Object.values(stateMap)) {
        const e = entries[entries.length - 1]; // most recent track per key
        if (!e) continue;
        if (e.user_id === myIdRef.current) continue;
        next.push({
          userId: e.user_id,
          label: e.label,
          color: e.color,
          x: e.x,
          y: e.y,
          draggingNodeId: e.dragging_node_id
        });
      }
      setPeers(next);
    };

    channel
      .on('presence', { event: 'sync' }, recomputePeers)
      .on('presence', { event: 'join' }, recomputePeers)
      .on('presence', { event: 'leave' }, recomputePeers)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED' || cancelled) return;
        await channel.track({
          user_id: myId,
          label: labelRef.current,
          color: colorRef.current,
          x: xRef.current,
          y: yRef.current,
          dragging_node_id: draggingRef.current,
          ts: Date.now()
        } satisfies PresencePayload);
      });

    // Throttled flush of local cursor/drag changes.
    const flushTimer = window.setInterval(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      void channel.track({
        user_id: myId,
        label: labelRef.current,
        color: colorRef.current,
        x: xRef.current,
        y: yRef.current,
        dragging_node_id: draggingRef.current,
        ts: Date.now()
      } satisfies PresencePayload);
    }, TRACK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(flushTimer);
      void channel.untrack().catch(() => undefined);
      void supabase.removeChannel(channel).catch(() => undefined);
      if (channelRef.current === channel) channelRef.current = null;
      setPeers([]);
    };
  }, [canvasId, myId, myEmail]);

  const setCursor = useCallback((x: number, y: number) => {
    xRef.current = x;
    yRef.current = y;
    dirtyRef.current = true;
  }, []);

  const setDragging = useCallback((nodeId: string | null) => {
    draggingRef.current = nodeId;
    dirtyRef.current = true;
  }, []);

  return { peers, setCursor, setDragging };
}
