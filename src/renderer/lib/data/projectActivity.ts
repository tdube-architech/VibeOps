import { useCallback, useEffect, useId, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';

const MACHINE_ID_KEY = 'vibeops:machine-id';

export function getMachineId(): string {
  let id = window.localStorage.getItem(MACHINE_ID_KEY);
  if (!id) {
    id = `m_${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 16)}`;
    window.localStorage.setItem(MACHINE_ID_KEY, id);
  }
  return id;
}

export interface DirtyFile {
  projectId: string;
  userId: string;
  machineId: string;
  filePath: string;
  hash: string;
  sizeBytes: number | null;
  modifiedAt: string;
}

interface DirtyRow {
  project_id: string;
  user_id: string;
  machine_id: string;
  file_path: string;
  hash: string;
  size_bytes: number | null;
  modified_at: string;
}

function rowToDirty(r: DirtyRow): DirtyFile {
  return {
    projectId: r.project_id,
    userId: r.user_id,
    machineId: r.machine_id,
    filePath: r.file_path,
    hash: r.hash,
    sizeBytes: r.size_bytes,
    modifiedAt: r.modified_at
  };
}

export interface ProjectCommit {
  id: string;
  projectId: string;
  userId: string;
  sha: string;
  shortSha: string | null;
  message: string | null;
  branch: string | null;
  kind: 'local' | 'push';
  ts: string;
}

interface CommitRow {
  id: string;
  project_id: string;
  user_id: string;
  sha: string;
  short_sha: string | null;
  message: string | null;
  branch: string | null;
  kind: 'local' | 'push';
  ts: string;
}

function rowToCommit(r: CommitRow): ProjectCommit {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    sha: r.sha,
    shortSha: r.short_sha,
    message: r.message,
    branch: r.branch,
    kind: r.kind,
    ts: r.ts
  };
}

export async function publishDirtyFile(args: {
  projectId: string;
  filePath: string;
  hash: string;
  sizeBytes: number | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const machineId = getMachineId();
  const { error } = await supabase.from('project_dirty_files').upsert({
    project_id: args.projectId,
    user_id: u.user.id,
    machine_id: machineId,
    file_path: args.filePath,
    hash: args.hash,
    size_bytes: args.sizeBytes,
    modified_at: new Date().toISOString()
  }, { onConflict: 'project_id,user_id,machine_id,file_path' });
  if (error) console.warn('[activity] publishDirtyFile', error.message);
}

export async function deleteDirtyFile(projectId: string, filePath: string): Promise<void> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from('project_dirty_files').delete()
    .eq('project_id', projectId)
    .eq('user_id', u.user.id)
    .eq('machine_id', getMachineId())
    .eq('file_path', filePath);
}

export async function publishCommit(args: {
  projectId: string;
  sha: string;
  shortSha: string;
  message: string;
  branch: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from('project_commits').upsert({
    project_id: args.projectId,
    user_id: u.user.id,
    sha: args.sha,
    short_sha: args.shortSha,
    message: args.message,
    branch: args.branch,
    kind: 'local',
    ts: new Date().toISOString()
  }, { onConflict: 'project_id,sha,kind' });
  if (error) console.warn('[activity] publishCommit', error.message);
}

export async function listDirtyFiles(projectId: string): Promise<DirtyFile[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_dirty_files')
    .select('*')
    .eq('project_id', projectId)
    .order('modified_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DirtyRow[]).map(rowToDirty);
}

export async function listRecentCommits(projectId: string, limit = 20): Promise<ProjectCommit[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_commits')
    .select('*')
    .eq('project_id', projectId)
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CommitRow[]).map(rowToCommit);
}

/**
 * Hook: while mounted, runs the always-on activity watcher for this project
 * (chokidar + git poll in main process). Subscribes to events and publishes
 * dirty-file/commit rows to Supabase. Other workspace members see them via
 * Realtime in their UI.
 */
export function useProjectActivity(projectId: string | null | undefined, cwd: string | null | undefined): void {
  useEffect(() => {
    if (!projectId || !cwd) return;
    let active = true;
    void api.projectActivity.start(projectId, cwd).catch(() => {});

    const offDirty = api.projectActivity.onFileDirty((evt) => {
      if (!active || evt.projectId !== projectId) return;
      if (evt.deleted) {
        void deleteDirtyFile(projectId, evt.filePath);
      } else if (evt.hash) {
        void publishDirtyFile({
          projectId,
          filePath: evt.filePath,
          hash: evt.hash,
          sizeBytes: evt.sizeBytes
        });
      }
    });
    const offCommit = api.projectActivity.onCommit((evt) => {
      if (!active || evt.projectId !== projectId) return;
      void publishCommit({
        projectId,
        sha: evt.sha,
        shortSha: evt.shortSha,
        message: evt.message,
        branch: evt.branch
      });
    });

    return () => {
      active = false;
      offDirty();
      offCommit();
      void api.projectActivity.stop(projectId).catch(() => {});
    };
  }, [projectId, cwd]);
}

export function useActivityRealtime(
  projectId: string | null | undefined,
  onChange: () => void
): void {
  // Each consumer gets its own channel — supabase-js deduplicates channels
  // by name, so a shared name causes ".on() after subscribe()" errors when
  // a second hook attaches to the same project.
  const consumerId = useId();
  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`project-activity-${projectId}-${consumerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_dirty_files', filter: `project_id=eq.${projectId}` },
        () => onChange())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_commits', filter: `project_id=eq.${projectId}` },
        () => onChange())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [projectId, onChange, consumerId]);
}

export function useProjectDirtyFiles(projectId: string | null | undefined): DirtyFile[] {
  const [list, setList] = useState<DirtyFile[]>([]);
  const refresh = useCallback(() => {
    if (!projectId) { setList([]); return; }
    void listDirtyFiles(projectId).then(setList).catch(() => {});
  }, [projectId]);
  useEffect(() => { refresh(); }, [refresh]);
  useActivityRealtime(projectId, refresh);
  return list;
}

export function useProjectCommits(projectId: string | null | undefined, limit = 20): ProjectCommit[] {
  const [list, setList] = useState<ProjectCommit[]>([]);
  const refresh = useCallback(() => {
    if (!projectId) { setList([]); return; }
    void listRecentCommits(projectId, limit).then(setList).catch(() => {});
  }, [projectId, limit]);
  useEffect(() => { refresh(); }, [refresh]);
  useActivityRealtime(projectId, refresh);
  return list;
}
