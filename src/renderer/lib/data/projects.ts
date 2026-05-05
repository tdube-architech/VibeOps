import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch, ProjectStatus } from '@shared/types';

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  repo_url: string | null;
  category: string | null;
  tags: string[] | null;
  primary_stack: string | null;
  status: ProjectStatus;
  visibility?: 'workspace' | 'private' | 'restricted';
  created_at: string;
  updated_at: string;
  last_audited_at: string | null;
}

interface UserStateRow {
  project_id: string;
  local_path: string | null;
  last_scanned_at: string | null;
}

function rowToProject(row: ProjectRow, userState?: UserStateRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    localPath: userState?.local_path ?? '',
    repoUrl: row.repo_url,
    category: row.category,
    status: row.status,
    primaryStack: row.primary_stack,
    visibility: row.visibility ?? 'workspace',
    tags: row.tags ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastScannedAt: userState?.last_scanned_at ?? null,
    lastAuditedAt: row.last_audited_at
  };
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error('Not signed in');
  return data.user.id;
}

export async function listProjects(q: ProjectListQuery & { workspaceId?: string }): Promise<Project[]> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const wsId = q.workspaceId;

  let projectQuery = supabase
    .from('projects')
    .select('id, workspace_id, name, slug, description, repo_url, category, tags, primary_stack, status, visibility, created_at, updated_at, last_audited_at')
    .order(q.sort === 'name' ? 'name' : 'updated_at', { ascending: q.sort === 'name' });

  if (wsId) projectQuery = projectQuery.eq('workspace_id', wsId);
  if (q.status && q.status !== 'all') projectQuery = projectQuery.eq('status', q.status);
  if (!q.includeArchived) projectQuery = projectQuery.neq('status', 'archived');
  if (q.search) projectQuery = projectQuery.ilike('name', `%${q.search}%`);

  const { data: projects, error } = await projectQuery;
  if (error) throw new Error(error.message);
  if (!projects || projects.length === 0) return [];

  const ids = projects.map((p) => p.id);
  const { data: states } = await supabase
    .from('project_user_state')
    .select('project_id, local_path, last_scanned_at')
    .eq('user_id', userId)
    .in('project_id', ids);
  const stateById = new Map<string, UserStateRow>();
  for (const s of states ?? []) stateById.set(s.project_id, s);

  return projects.map((p) => ({ ...rowToProject(p as ProjectRow, stateById.get(p.id)), source: 'cloud' as const }));
}

/**
 * Returns cloud-synced projects in the active workspace + local-only projects
 * not yet migrated. Each entry tagged with source: 'cloud' | 'local'.
 *
 * Local list intentionally drops workspaceId filter — local rows live with
 * the legacy 'ws_local' workspace that doesn't match any server UUID.
 */
export async function listProjectsMerged(q: ProjectListQuery & { workspaceId?: string }): Promise<Project[]> {
  const cloud = await listProjects(q);

  const localQuery: ProjectListQuery = {};
  if (q.search) localQuery.search = q.search;
  if (q.status) localQuery.status = q.status;
  if (q.sort) localQuery.sort = q.sort;
  if (q.includeArchived) localQuery.includeArchived = q.includeArchived;

  const [localList, migrateStatus] = await Promise.all([
    api.projects.list(localQuery).catch(() => [] as Project[]),
    api.migrate.status().catch(() => ({ unmigrated: [] as Project[], alreadyMigrated: 0, skippedAt: null }))
  ]);

  const isLegacyLocalId = (id: string) => /^prj_[a-z0-9]+$/i.test(id);
  const unmigratedIds = new Set(migrateStatus.unmigrated.map((u) => u.id));
  const cloudPaths = new Set(cloud.map((p) => p.localPath).filter(Boolean));
  const localOnly = localList
    .filter((p) => isLegacyLocalId(p.id))
    .filter((p) => unmigratedIds.has(p.id))
    .filter((p) => !cloudPaths.has(p.localPath))
    .map((p) => ({ ...p, source: 'local' as const }));

  return [...cloud, ...localOnly];
}

export async function getProject(id: string): Promise<Project | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) {
    // local-only project — fall back to local SQLite IPC
    const local = await api.projects.get(id).catch(() => null);
    if (!local) return null;
    return { ...local, source: 'local' as const };
  }

  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const { data: row, error } = await supabase
    .from('projects')
    .select('id, workspace_id, name, slug, description, repo_url, category, tags, primary_stack, status, visibility, created_at, updated_at, last_audited_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const { data: state } = await supabase
    .from('project_user_state')
    .select('project_id, local_path, last_scanned_at')
    .eq('user_id', userId)
    .eq('project_id', id)
    .maybeSingle();
  return { ...rowToProject(row as ProjectRow, state ?? undefined), source: 'cloud' as const };
}

export async function checkPathExists(localPath: string, workspaceId: string): Promise<Project | null> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const { data: states } = await supabase
    .from('project_user_state')
    .select('project_id')
    .eq('user_id', userId)
    .eq('local_path', localPath);
  const ids = (states ?? []).map((s) => s.project_id);
  if (ids.length === 0) return null;
  const { data: rows } = await supabase
    .from('projects')
    .select('id, workspace_id, name, slug, description, repo_url, category, tags, primary_stack, status, visibility, created_at, updated_at, last_audited_at')
    .in('id', ids)
    .eq('workspace_id', workspaceId)
    .limit(1);
  if (!rows?.length) return null;
  return rowToProject(rows[0] as ProjectRow, undefined);
}

export async function addProject(
  input: ProjectInput,
  workspaceId: string,
  allowDuplicate = false
): Promise<Project> {
  const userId = await getCurrentUserId();
  const supabase = getSupabase();

  if (!allowDuplicate) {
    const dup = await checkPathExists(input.localPath, workspaceId);
    if (dup) {
      const err = new Error(`Path already registered as project ${dup.id}`) as Error & { code?: string; meta?: unknown };
      err.code = 'DUPLICATE_PATH';
      err.meta = { existing: dup };
      throw err;
    }
  }

  const { data: insertedRow, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name: input.name.trim(),
      slug: slugify(input.name),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      status: input.status ?? 'active',
      tags: input.tags ?? [],
      repo_url: input.repoUrl?.trim() || null
    })
    .select('id, workspace_id, name, slug, description, repo_url, category, tags, primary_stack, status, visibility, created_at, updated_at, last_audited_at')
    .single();
  if (error) throw new Error(error.message);

  await supabase
    .from('project_user_state')
    .upsert({
      project_id: (insertedRow as ProjectRow).id,
      user_id: userId,
      local_path: input.localPath
    });

  const row = insertedRow as ProjectRow;
  return rowToProject(row, { project_id: row.id, local_path: input.localPath, last_scanned_at: null });
}

export async function updateProject(patch: ProjectPatch): Promise<Project> {
  const supabase = getSupabase();
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.category !== undefined) update.category = patch.category;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.tags !== undefined) update.tags = patch.tags;
  if (patch.repoUrl !== undefined) update.repo_url = patch.repoUrl;

  const { data, error } = await supabase
    .from('projects')
    .update(update)
    .eq('id', patch.id)
    .select('id, workspace_id, name, slug, description, repo_url, category, tags, primary_stack, status, visibility, created_at, updated_at, last_audited_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToProject(data as ProjectRow);
}

export async function archiveProject(id: string): Promise<Project> {
  return updateProject({ id, status: 'archived' });
}

export async function unarchiveProject(id: string): Promise<Project> {
  return updateProject({ id, status: 'active' });
}

export async function removeProject(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setProjectLocalPath(projectId: string, localPath: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from('project_user_state')
    .upsert({ project_id: projectId, user_id: userId, local_path: localPath });
  if (error) throw new Error(error.message);
}
