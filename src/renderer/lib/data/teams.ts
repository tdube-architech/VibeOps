import { getSupabase } from '@/lib/supabase';
import type { Team, TeamMember } from '@shared/types';

interface TeamRow { id: string; workspace_id: string; name: string; created_at: string; }
interface TeamMemberRow { team_id: string; user_id: string; role: 'lead' | 'member'; joined_at: string; }

export async function listTeams(workspaceId: string): Promise<Team[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('teams').select('*')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamRow[]).map((r) => ({
    id: r.id, workspaceId: r.workspace_id, name: r.name, createdAt: r.created_at
  }));
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('team_members').select('*').eq('team_id', teamId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as TeamMemberRow[]).map((r) => ({
    teamId: r.team_id, userId: r.user_id, role: r.role, joinedAt: r.joined_at
  }));
}

export async function createTeam(workspaceId: string, name: string): Promise<Team> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('teams').insert({ workspace_id: workspaceId, name }).select('*').single();
  if (error) throw new Error(error.message);
  const r = data as TeamRow;
  return { id: r.id, workspaceId: r.workspace_id, name: r.name, createdAt: r.created_at };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('teams').delete().eq('id', teamId);
  if (error) throw new Error(error.message);
}

export async function addTeamMember(teamId: string, userId: string, role: 'lead' | 'member' = 'member'): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('team_members').insert({ team_id: teamId, user_id: userId, role });
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('team_members').delete()
    .eq('team_id', teamId).eq('user_id', userId);
  if (error) throw new Error(error.message);
}
