import { getSupabase } from '@/lib/supabase';

export type MemberRole = 'owner' | 'editor' | 'viewer';
export type ProjectVisibility = 'workspace' | 'private' | 'restricted';

export interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: MemberRole;
  token: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

interface MemberRow {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: MemberRole;
  joined_at: string;
}
interface InviteRow {
  id: string;
  workspace_id: string;
  email: string;
  role: MemberRole;
  token: string;
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_workspace_members', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
  return (data as MemberRow[] | null ?? []).map((r) => ({
    userId: r.user_id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    role: r.role,
    joinedAt: r.joined_at
  }));
}

export async function listPendingInvitations(workspaceId: string): Promise<PendingInvitation[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('list_pending_invitations', { ws_id: workspaceId });
  if (error) throw new Error(error.message);
  return (data as InviteRow[] | null ?? []).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    email: r.email,
    role: r.role,
    token: r.token,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    createdAt: r.created_at
  }));
}

export async function inviteMember(
  workspaceId: string, email: string, role: MemberRole = 'editor'
): Promise<PendingInvitation> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('invite_member', {
    ws_id: workspaceId,
    invitee_email: email,
    invitee_role: role
  });
  if (error) throw new Error(error.message);
  const r = data as InviteRow;
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    email: r.email,
    role: r.role,
    token: r.token,
    invitedBy: r.invited_by,
    expiresAt: r.expires_at,
    createdAt: r.created_at
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('revoke_invitation', { invite_id: invitationId });
  if (error) throw new Error(error.message);
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('remove_member', {
    ws_id: workspaceId,
    target_user_id: userId
  });
  if (error) throw new Error(error.message);
}

export async function updateMemberRole(workspaceId: string, userId: string, role: MemberRole): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('update_member_role', {
    ws_id: workspaceId,
    target_user_id: userId,
    new_role: role
  });
  if (error) throw new Error(error.message);
}

export function buildAcceptInviteUrl(token: string): string {
  return `vibeops://accept-invite/${encodeURIComponent(token)}`;
}
