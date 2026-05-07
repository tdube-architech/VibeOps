import { useQuery } from '@tanstack/react-query';
import { listMembers, type WorkspaceMember } from '@/lib/data/members';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';

export interface TaskMember {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}

// Workspace members baseline. Phase F union with team members happens implicitly
// (team members are workspace members). Cross-workspace project sharing is
// future work and intentionally NOT included.
export function useTaskMembers() {
  const wsId = useActiveWorkspaceId();
  return useQuery({
    queryKey: ['tasks', 'members', wsId],
    queryFn: async (): Promise<TaskMember[]> => {
      if (!wsId) return [];
      const members = await listMembers(wsId);
      return members.map((m: WorkspaceMember) => ({
        userId: m.userId,
        email: m.email,
        displayName: m.displayName,
        avatarUrl: m.avatarUrl
      }));
    },
    enabled: !!wsId
  });
}
