import { useEffect, useState } from 'react';
import { listWorkspaceGitHubStatus, pickDisplayLabel } from './githubIntegration';

interface Cache {
  ts: number;
  byUserId: Map<string, string>;
}

const TTL_MS = 60_000;
const cache = new Map<string, Cache>();
const inflight = new Map<string, Promise<Cache>>();

async function fetchLabels(workspaceId: string): Promise<Cache> {
  const fresh = cache.get(workspaceId);
  if (fresh && Date.now() - fresh.ts < TTL_MS) return fresh;
  const existing = inflight.get(workspaceId);
  if (existing) return existing;
  const p = (async () => {
    const rows = await listWorkspaceGitHubStatus(workspaceId);
    const byUserId = new Map<string, string>();
    for (const r of rows) byUserId.set(r.userId, pickDisplayLabel(r));
    const c: Cache = { ts: Date.now(), byUserId };
    cache.set(workspaceId, c);
    inflight.delete(workspaceId);
    return c;
  })();
  inflight.set(workspaceId, p);
  return p;
}

/**
 * Resolves user ids to friendly labels (`@github`, email, or short id) by
 * batch-fetching the workspace's github status. Cached per workspace for
 * TTL_MS.
 */
export function useUserLabel(workspaceId: string | null | undefined, userId: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!workspaceId || !userId) { setLabel(null); return; }
    let cancelled = false;
    void fetchLabels(workspaceId).then((c) => {
      if (cancelled) return;
      setLabel(c.byUserId.get(userId) ?? userId.slice(0, 8) + '…');
    }).catch(() => {
      if (!cancelled) setLabel(userId.slice(0, 8) + '…');
    });
    return () => { cancelled = true; };
  }, [workspaceId, userId]);
  return label;
}
