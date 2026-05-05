import { getSupabase } from '@/lib/supabase';
import type { Workspace, WorkspaceInput } from '@shared/types';

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `ws-${Math.random().toString(36).slice(2, 8)}`;
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, slug, description, created_at, updated_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToWorkspace);
}

export async function ensureDefaultWorkspace(displayLabel: string): Promise<Workspace> {
  const existing = await listWorkspaces();
  if (existing.length > 0) return existing[0]!;

  const userId = await getCurrentUserId();
  const supabase = getSupabase();
  const baseSlug = slugify(displayLabel);
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: `${displayLabel}'s Workspace`,
      slug: `${baseSlug}-${userId.slice(0, 6)}`,
      owner_id: userId,
      plan: 'free'
    })
    .select('id, name, slug, description, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToWorkspace(data as WorkspaceRow);
}

export async function createWorkspace(input: WorkspaceInput): Promise<Workspace> {
  const userId = await getCurrentUserId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .insert({
      name: input.name.trim(),
      slug: `${slugify(input.name)}-${userId.slice(0, 6)}`,
      owner_id: userId,
      plan: 'free'
    })
    .select('id, name, slug, description, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToWorkspace(data as WorkspaceRow);
}

export async function renameWorkspace(id: string, name: string): Promise<Workspace> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: name.trim() })
    .eq('id', id)
    .select('id, name, slug, description, created_at, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToWorkspace(data as WorkspaceRow);
}

export async function removeWorkspace(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('workspaces').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
