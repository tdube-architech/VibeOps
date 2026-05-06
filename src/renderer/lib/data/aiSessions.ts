import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export type AiSessionStatus = 'starting' | 'active' | 'ended' | 'failed';
export type AiEventKind =
  | 'stdout' | 'stderr' | 'stdin'
  | 'prompt' | 'response'
  | 'tool_call' | 'tool_result'
  | 'file_diff' | 'system';

export interface AiSession {
  id: string;
  workspaceId: string;
  projectId: string;
  ownerUserId: string;
  provider: string;
  command: string;
  args: string[];
  cwd: string | null;
  label: string | null;
  status: AiSessionStatus;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  clientLocalId: string | null;
  sessionStartSha: string | null;
  controlOpen: boolean;
  controllerUserId: string | null;
  controllerClaimedAt: string | null;
}

export interface AiSessionEvent {
  id: string;
  sessionId: string;
  kind: AiEventKind;
  payload: string | null;
  ts: string;
}

interface AiSessionRow {
  id: string;
  workspace_id: string;
  project_id: string;
  owner_user_id: string;
  provider: string;
  command: string;
  args: string[];
  cwd: string | null;
  label: string | null;
  status: AiSessionStatus;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  client_local_id: string | null;
  session_start_sha: string | null;
  control_open: boolean | null;
  controller_user_id: string | null;
  controller_claimed_at: string | null;
}

interface AiEventRow {
  id: string;
  session_id: string;
  kind: AiEventKind;
  payload: string | null;
  ts: string;
}

function rowToSession(r: AiSessionRow): AiSession {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    projectId: r.project_id,
    ownerUserId: r.owner_user_id,
    provider: r.provider,
    command: r.command,
    args: r.args,
    cwd: r.cwd,
    label: r.label,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    exitCode: r.exit_code,
    clientLocalId: r.client_local_id,
    sessionStartSha: r.session_start_sha,
    controlOpen: r.control_open ?? false,
    controllerUserId: r.controller_user_id,
    controllerClaimedAt: r.controller_claimed_at
  };
}

function rowToEvent(r: AiEventRow): AiSessionEvent {
  return { id: r.id, sessionId: r.session_id, kind: r.kind, payload: r.payload, ts: r.ts };
}

export interface CreateSessionInput {
  workspaceId: string;
  projectId: string;
  provider: string;
  command: string;
  args: string[];
  cwd: string | null;
  label?: string | null;
  clientLocalId?: string | null;
  sessionStartSha?: string | null;
}

export async function createAiSession(input: CreateSessionInput): Promise<string> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      owner_user_id: u.user.id,
      provider: input.provider,
      command: input.command,
      args: input.args,
      cwd: input.cwd,
      label: input.label ?? null,
      client_local_id: input.clientLocalId ?? null,
      session_start_sha: input.sessionStartSha ?? null,
      status: 'active'
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === 'P0017') throw new Error(`AI_SESSION_LIMIT: ${error.message}`);
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

// Coalesce many tiny chunks into one row to avoid hammering Supabase.
const eventQueues = new Map<string, { kind: AiEventKind; buffer: string; timer: ReturnType<typeof setTimeout> | null }>();
const FLUSH_MS = 250;

export function appendSessionEvent(sessionId: string, kind: AiEventKind, payload: string): void {
  const key = `${sessionId}:${kind}`;
  let entry = eventQueues.get(key);
  if (!entry) {
    entry = { kind, buffer: '', timer: null };
    eventQueues.set(key, entry);
  }
  entry.buffer += payload;
  if (!entry.timer) {
    entry.timer = setTimeout(() => { void flushQueue(sessionId, kind); }, FLUSH_MS);
  }
}

async function flushQueue(sessionId: string, kind: AiEventKind): Promise<void> {
  const key = `${sessionId}:${kind}`;
  const entry = eventQueues.get(key);
  if (!entry) return;
  const payload = entry.buffer;
  eventQueues.delete(key);
  if (entry.timer) clearTimeout(entry.timer);
  if (!payload) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('ai_session_events')
    .insert({ session_id: sessionId, kind, payload });
  if (error) {
    // best effort — log to console, don't throw (terminal is more important than streaming)
    console.warn('[ai-session] failed to flush event', error.message);
  }
}

export async function endSession(sessionId: string, exitCode: number | null): Promise<void> {
  // flush all pending event queues for this session first
  const flushable = [...eventQueues.keys()].filter((k) => k.startsWith(`${sessionId}:`));
  await Promise.all(flushable.map((k) => {
    const kind = k.split(':')[1] as AiEventKind;
    return flushQueue(sessionId, kind);
  }));
  const supabase = getSupabase();
  const { error } = await supabase
    .from('ai_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString(), exit_code: exitCode })
    .eq('id', sessionId);
  if (error) console.warn('[ai-session] failed to mark ended', error.message);
}

export async function listActiveSessionsForProject(projectId: string): Promise<AiSession[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ai_sessions')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['starting', 'active'])
    .order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AiSessionRow[]).map(rowToSession);
}

export async function listEventsForSession(sessionId: string, limit = 1000): Promise<AiSessionEvent[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ai_session_events')
    .select('*')
    .eq('session_id', sessionId)
    .order('ts', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as AiEventRow[]).map(rowToEvent);
}

export interface AiSessionDiff {
  id: string;
  sessionId: string;
  projectId: string;
  filePath: string;
  diffKind: 'create' | 'modify' | 'delete';
  beforeHash: string | null;
  afterHash: string | null;
  sizeBytes: number | null;
  status: 'proposed' | 'applied' | 'reverted' | 'rejected';
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

interface AiDiffRow {
  id: string;
  session_id: string;
  project_id: string;
  file_path: string;
  diff_kind: 'create' | 'modify' | 'delete';
  before_hash: string | null;
  after_hash: string | null;
  size_bytes: number | null;
  status: 'proposed' | 'applied' | 'reverted' | 'rejected';
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

function rowToDiff(r: AiDiffRow): AiSessionDiff {
  return {
    id: r.id,
    sessionId: r.session_id,
    projectId: r.project_id,
    filePath: r.file_path,
    diffKind: r.diff_kind,
    beforeHash: r.before_hash,
    afterHash: r.after_hash,
    sizeBytes: r.size_bytes,
    status: r.status,
    resolvedAt: r.resolved_at,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at
  };
}

export async function recordSessionDiff(args: {
  sessionId: string;
  projectId: string;
  filePath: string;
  diffKind: 'create' | 'modify' | 'delete';
  beforeHash: string | null;
  afterHash: string | null;
  sizeBytes: number | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('ai_session_diffs').insert({
    session_id: args.sessionId,
    project_id: args.projectId,
    file_path: args.filePath,
    diff_kind: args.diffKind,
    before_hash: args.beforeHash,
    after_hash: args.afterHash,
    size_bytes: args.sizeBytes
  });
  if (error) console.warn('[ai-session] failed to record diff', error.message);
}

export async function listSessionDiffs(sessionId: string): Promise<AiSessionDiff[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('ai_session_diffs')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as AiDiffRow[]).map(rowToDiff);
}

export async function updateDiffStatus(
  diffId: string,
  status: 'applied' | 'reverted' | 'rejected'
): Promise<void> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('ai_session_diffs')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: u.user?.id ?? null
    })
    .eq('id', diffId);
  if (error) throw new Error(error.message);
}

export function useSessionDiffsRealtime(
  sessionId: string | null | undefined,
  onChange: () => void
): void {
  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ai-session-diffs-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ai_session_diffs', filter: `session_id=eq.${sessionId}` },
        () => onChange())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, onChange]);
}

/**
 * End ai_session rows owned by the current user that look orphaned. A row is
 * orphaned if it's older than `staleSeconds` AND has no events in the same
 * window — a live session on another machine would still be emitting stdout
 * events. Used at app startup to clear leftovers and as a manual reset.
 */
export async function endAllMyActiveSessions(staleSeconds = 60): Promise<number> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;
  const cutoff = new Date(Date.now() - staleSeconds * 1000).toISOString();

  // Pull candidate rows.
  const { data: candidates, error: listErr } = await supabase
    .from('ai_sessions')
    .select('id, started_at')
    .eq('owner_user_id', u.user.id)
    .in('status', ['starting', 'active'])
    .lt('started_at', cutoff);
  if (listErr || !candidates) return 0;

  const orphanIds: string[] = [];
  for (const row of candidates as Array<{ id: string; started_at: string }>) {
    // Any event in the staleness window means the session is alive somewhere.
    const { count } = await supabase
      .from('ai_session_events')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', row.id)
      .gte('ts', cutoff);
    if ((count ?? 0) === 0) orphanIds.push(row.id);
  }

  if (orphanIds.length === 0) return 0;
  const { error } = await supabase
    .from('ai_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .in('id', orphanIds);
  if (error) {
    console.warn('[ai-session] failed to end orphans', error.message);
    return 0;
  }
  return orphanIds.length;
}

export async function listMyConcurrentActiveCount(): Promise<number> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;
  const { count, error } = await supabase
    .from('ai_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', u.user.id)
    .in('status', ['starting', 'active']);
  if (error) return 0;
  return count ?? 0;
}

/** Realtime subscription of new events for a single session (spectator stream). */
export function useSessionEventsRealtime(
  sessionId: string | null | undefined,
  onEvent: (e: AiSessionEvent) => void
): void {
  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ai-session-events-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_session_events', filter: `session_id=eq.${sessionId}` },
        (payload) => { onEvent(rowToEvent(payload.new as AiEventRow)); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, onEvent]);
}

/** Realtime subscription of session row changes (status flip to ended). */
// =====================================================================
// Remote control: owner toggle, claim/release, keystroke broadcast.
// =====================================================================

export async function toggleSessionControl(sessionId: string, open: boolean): Promise<AiSession> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('toggle_ai_session_control', {
    session_id: sessionId,
    is_open: open
  });
  if (error) throw new Error(error.message);
  return rowToSession(data as AiSessionRow);
}

export async function claimSessionControl(sessionId: string): Promise<AiSession> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('claim_ai_session_control', {
    session_id: sessionId
  });
  if (error) throw new Error(error.message);
  return rowToSession(data as AiSessionRow);
}

export async function releaseSessionControl(sessionId: string): Promise<AiSession> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('release_ai_session_control', {
    session_id: sessionId
  });
  if (error) throw new Error(error.message);
  return rowToSession(data as AiSessionRow);
}

export interface ControlKeystroke {
  data: string;
  fromUserId: string;
}

/**
 * Spectator-side: persistent keystroke sender. Returns a `send(data)`
 * function that broadcasts to the owner's listener. Channel is kept open
 * for the hook's lifetime so we don't subscribe per keystroke.
 */
export function useControlKeystrokeSender(
  sessionId: string | null | undefined,
  fromUserId: string | null
): (data: string) => void {
  const consumerId = useId();
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']> | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    if (!sessionId || !fromUserId) return;
    const supabase = getSupabase();
    const ch = supabase.channel(`ai-control-${sessionId}-s-${consumerId}`, {
      config: { broadcast: { self: false, ack: false } }
    });
    ch.subscribe((status) => { readyRef.current = status === 'SUBSCRIBED'; });
    channelRef.current = ch;
    return () => {
      readyRef.current = false;
      const c = channelRef.current;
      channelRef.current = null;
      if (c) void getSupabase().removeChannel(c);
    };
  }, [sessionId, fromUserId, consumerId]);

  return useCallback((data: string) => {
    if (!sessionId || !fromUserId || !readyRef.current) return;
    const ch = channelRef.current;
    if (!ch) return;
    void ch.send({
      type: 'broadcast',
      event: 'key',
      payload: { data, fromUserId } as ControlKeystroke
    });
  }, [sessionId, fromUserId]);
}

/**
 * Owner-side hook: subscribes to keystroke broadcasts for a session and
 * invokes onKey for each. Suppresses messages while the session is closed
 * to control or the controller is the owner themselves.
 */
export function useControlKeystrokeReceiver(
  sessionId: string | null | undefined,
  onKey: (data: string, fromUserId: string) => void
): void {
  const consumerId = useId();
  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ai-control-${sessionId}-r-${consumerId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'key' }, ({ payload }) => {
        const p = payload as ControlKeystroke;
        if (p?.data) onKey(p.data, p.fromUserId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, onKey, consumerId]);
}

export function useSessionRealtime(
  sessionId: string | null | undefined,
  onUpdate: (s: AiSession) => void
): void {
  useEffect(() => {
    if (!sessionId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ai-session-${sessionId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_sessions', filter: `id=eq.${sessionId}` },
        (payload) => { onUpdate(rowToSession(payload.new as AiSessionRow)); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [sessionId, onUpdate]);
}

/** Hook: live list of active sessions in a project (for spectator picker). */
export function useActiveSessionsForProject(projectId: string | null | undefined): AiSession[] {
  const [list, setList] = useState<AiSession[]>([]);
  useEffect(() => {
    if (!projectId) { setList([]); return; }
    let cancelled = false;
    const refresh = (): void => {
      void listActiveSessionsForProject(projectId).then((rows) => { if (!cancelled) setList(rows); });
    };
    refresh();
    const supabase = getSupabase();
    const channel = supabase
      .channel(`ai-sessions-project-${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'ai_sessions', filter: `project_id=eq.${projectId}` },
        () => refresh())
      .subscribe();
    return () => { cancelled = true; void supabase.removeChannel(channel); };
  }, [projectId]);
  return list;
}
