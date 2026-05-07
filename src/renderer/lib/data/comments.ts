import { getSupabase } from '@/lib/supabase';

export type CommentTarget = 'finding' | 'task' | 'memory';

export interface Comment {
  id: string;
  workspaceId: string;
  targetType: CommentTarget;
  targetId: string;
  authorUserId: string;
  authorEmail: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface CommentRow {
  id: string;
  workspace_id: string;
  target_type: CommentTarget;
  target_id: string;
  author_user_id: string;
  author_email: string;
  author_display_name: string | null;
  author_avatar_url: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

function rowToComment(r: CommentRow): Comment {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    targetType: r.target_type,
    targetId: r.target_id,
    authorUserId: r.author_user_id,
    authorEmail: r.author_email,
    authorDisplayName: r.author_display_name,
    authorAvatarUrl: r.author_avatar_url,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function listComments(target: CommentTarget, targetId: string): Promise<Comment[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_comments', {
    for_target_type: target,
    for_target_id: targetId
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CommentRow[]).map(rowToComment);
}

export async function createComment(
  workspaceId: string,
  target: CommentTarget,
  targetId: string,
  body: string
): Promise<Comment> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('comments')
    .insert({
      workspace_id: workspaceId,
      target_type: target,
      target_id: targetId,
      author_user_id: u.user.id,
      body
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  // re-fetch via list_comments to get author profile joined
  const fresh = await listComments(target, targetId);
  return fresh.find((c) => c.id === (data as { id: string }).id) ?? fresh[fresh.length - 1]!;
}

export async function deleteComment(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function updateComment(id: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('comments').update({ body }).eq('id', id);
  if (error) throw new Error(error.message);
}

export interface TaskCommentSummary {
  taskId: string;
  total: number;
  unread: number;
}

interface SummaryRow { target_id: string; total: number; unread: number; }

export async function getTaskCommentSummary(): Promise<TaskCommentSummary[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('task_comment_summary');
  if (error) throw new Error(error.message);
  return ((data ?? []) as SummaryRow[]).map((r) => ({
    taskId: r.target_id, total: r.total, unread: r.unread
  }));
}

export async function markTaskCommentsRead(taskId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_task_comments_read', { p_task_id: taskId });
  if (error) throw new Error(error.message);
}
