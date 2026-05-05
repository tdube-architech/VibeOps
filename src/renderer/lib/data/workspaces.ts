import { getSupabase } from '@/lib/supabase';
import type { Workspace, WorkspaceInput } from '@shared/types';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, created_at, updated_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToWorkspace);
}

export async function ensureDefaultWorkspace(displayLabel: string): Promise<Workspace> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('ensure_default_workspace', { display_label: displayLabel });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('ensure_default_workspace returned no workspace');
  return rowToWorkspace(data as WorkspaceRow);
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_workspace', { ws_name: input.name });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('create_workspace returned no workspace');
  return rowToWorkspace(data as WorkspaceRow);
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('id, name, slug, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToWorkspace(data as WorkspaceRow);
}

export async function removeWorkspace(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('workspaces').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
