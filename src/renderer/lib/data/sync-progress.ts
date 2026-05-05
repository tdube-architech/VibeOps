import { getSupabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCloudId(id: string): boolean {
  return UUID_RE.test(id);
}

async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Push last_scanned_at to the user's project_user_state row + primary_stack to
 * the projects row when a scan completes on a cloud project.
 * No-op for legacy local IDs.
 */
export async function pushScanCompleted(
  projectId: string,
  when: string = new Date().toISOString(),
  localPath?: string,
  primaryStack?: string | null
): Promise<void> {
  if (!isCloudId(projectId)) return;
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!userId) return;
  const row: Record<string, unknown> = {
    project_id: projectId,
    user_id: userId,
    last_scanned_at: when
  };
  if (localPath) row.local_path = localPath;
  await supabase.from('project_user_state').upsert(row);
  if (primaryStack !== undefined) {
    await supabase.from('projects').update({ primary_stack: primaryStack }).eq('id', projectId);
  }
}

/**
 * Push last_audited_at to the projects row when an audit completes on a cloud project.
 */
export async function pushAuditCompleted(projectId: string, when: string = new Date().toISOString()): Promise<void> {
  if (!isCloudId(projectId)) return;
  const supabase = getSupabase();
  await supabase.from('projects').update({ last_audited_at: when }).eq('id', projectId);
}
