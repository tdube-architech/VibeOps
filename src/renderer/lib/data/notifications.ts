import { getSupabase } from '@/lib/supabase';

export interface Notification {
  id: string;
  userId: string;
  workspaceId: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  user_id: string;
  workspace_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

function rowToNotification(r: Row): Notification {
  return {
    id: r.id,
    userId: r.user_id,
    workspaceId: r.workspace_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    payload: r.payload,
    readAt: r.read_at,
    createdAt: r.created_at
  };
}

export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markAllRead(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw new Error(error.message);
}

export async function deleteNotification(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('notifications').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
