import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listTeams, listTeamMembers, createTeam, deleteTeam, addTeamMember, removeTeamMember } from '@/lib/data/teams';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';

const KEY = ['teams'] as const;

export function useTeamsList() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: [...KEY, wsId],
    queryFn: () => (wsId ? listTeams(wsId) : Promise.resolve([])),
    enabled: !!wsId
  });
}

export function useTeamMembersList(teamId: string | null) {
  return useQuery({
    queryKey: [...KEY, 'members', teamId],
    queryFn: () => (teamId ? listTeamMembers(teamId) : Promise.resolve([])),
    enabled: !!teamId
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  const wsId = useActiveWorkspaceId();
  return useMutation({
    mutationFn: (name: string) => {
      if (!wsId) throw new Error('No active workspace');
      return createTeam(wsId, name);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}

export function useToggleTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ teamId, userId, on }: { teamId: string; userId: string; on: boolean }) => {
      if (on) await addTeamMember(teamId, userId);
      else await removeTeamMember(teamId, userId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY })
  });
}
