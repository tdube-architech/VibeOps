import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { Memory, MemorySource } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isCloud(id: string): boolean { return UUID_RE.test(id); }

interface MemoryRow {
  id: string;
  project_id: string;
  workspace_id: string;
  version: number;
  content: string;
  source: MemorySource;
  authored_by_user_id: string;
  scan_id: string | null;
  created_at: string;
}

function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    content: row.content,
    source: row.source,
    fileWritten: false,
    scanId: row.scan_id,
    createdAt: row.created_at
  };
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}

async function getProjectWorkspaceId(projectId: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('projects').select('workspace_id').eq('id', projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('project not found');
  return (data as { workspace_id: string }).workspace_id;
}

export async function listMemoryVersions(projectId: string): Promise<Memory[]> {
  if (!isCloud(projectId)) return api.memory.listVersions(projectId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('memory_versions').select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as MemoryRow[]).map(rowToMemory);
}

export async function latestMemory(projectId: string): Promise<Memory | null> {
  if (!isCloud(projectId)) return api.memory.getLatest(projectId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('memory_versions').select('*')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToMemory(data as MemoryRow) : null;
}

export async function getMemoryVersion(memoryId: string): Promise<Memory | null> {
  if (!isCloud(memoryId)) return api.memory.getVersion(memoryId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('memory_versions').select('*').eq('id', memoryId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToMemory(data as MemoryRow) : null;
}

/**
 * Save a new draft. For cloud projects, inserts a new row in memory_versions
 * with version = max(existing) + 1. For local projects, defers to local IPC.
 */
export async function saveMemoryDraft(
  projectId: string, content: string, source: MemorySource = 'user-edited'
): Promise<Memory> {
  if (!isCloud(projectId)) return api.memory.saveDraft(projectId, content, source);
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const workspaceId = await getProjectWorkspaceId(projectId);

  // Compute next version
  const { data: maxRow } = await supabase
    .from('memory_versions').select('version')
    .eq('project_id', projectId)
    .order('version', { ascending: false })
    .limit(1).maybeSingle();
  const nextVersion = (((maxRow as { version?: number } | null)?.version ?? 0)) + 1;

  const { data, error } = await supabase
    .from('memory_versions').insert({
      project_id: projectId,
      workspace_id: workspaceId,
      version: nextVersion,
      content,
      source,
      authored_by_user_id: userId
    }).select('*').single();
  if (error) throw new Error(error.message);
  return rowToMemory(data as MemoryRow);
}

/**
 * Generate a new draft. Always uses local main-process service (it needs scan
 * data + project tree). After local generation completes, push the resulting
 * draft to server for cloud projects.
 */
export async function generateMemoryDraft(
  projectId: string,
  mode: 'fresh' | 'merge-with-disk' | 'merge-with-version' = 'fresh',
  version?: number,
  ctx?: { localPath: string; name: string }
): Promise<{ projectId: string; content: string; source: MemorySource; scanId: string | null }> {
  return api.memory.generateDraft(projectId, mode, version, ctx);
}
