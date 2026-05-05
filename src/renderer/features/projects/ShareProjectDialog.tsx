import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Lock, UserCog, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getSupabase } from '@/lib/supabase';
import { listMembers } from '@/lib/data/members';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { toast } from '@/lib/toast';
import type { ProjectVisibility, MemberRole } from '@/lib/data/members';

interface ProjectMember {
  userId: string;
  role: MemberRole;
  email: string;
  displayName: string | null;
}

async function fetchProjectMembers(projectId: string, workspaceId: string): Promise<ProjectMember[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_members')
    .select('user_id, role')
    .eq('project_id', projectId);
  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  const wsMembers = await listMembers(workspaceId);
  const byId = new Map(wsMembers.map((m) => [m.userId, m]));
  return data
    .map((r) => {
      const m = byId.get(r.user_id as string);
      if (!m) return null;
      return {
        userId: r.user_id as string,
        role: r.role as MemberRole,
        email: m.email,
        displayName: m.displayName
      } satisfies ProjectMember;
    })
    .filter((m): m is ProjectMember => m !== null);
}

interface Props {
  projectId: string;
  projectName: string;
  visibility: ProjectVisibility;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareProjectDialog({ projectId, projectName, visibility, open, onOpenChange }: Props) {
  const wsId = useActiveWorkspaceId();
  const qc = useQueryClient();
  const [localVisibility, setLocalVisibility] = useState<ProjectVisibility>(visibility);

  useEffect(() => { setLocalVisibility(visibility); }, [visibility, open]);

  const wsMembers = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: () => listMembers(wsId!),
    enabled: !!wsId && open
  });
  const projectMembers = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => fetchProjectMembers(projectId, wsId!),
    enabled: !!wsId && open
  });

  const setVisibility = useMutation({
    mutationFn: async (next: ProjectVisibility) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('set_project_visibility', { p_id: projectId, vis: next });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, next) => {
      setLocalVisibility(next);
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Visibility updated');
    },
    onError: (e) => toast.error('Update failed', (e as Error).message)
  });

  const addMember = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole }) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('project_members').insert({
        project_id: projectId, user_id: userId, role
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
    onError: (e) => toast.error('Add failed', (e as Error).message)
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.from('project_members')
        .delete().eq('project_id', projectId).eq('user_id', userId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] })
  });

  const projectMemberIds = new Set((projectMembers.data ?? []).map((m) => m.userId));
  const candidates = (wsMembers.data ?? []).filter((m) => !projectMemberIds.has(m.userId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share &quot;{projectName}&quot;</DialogTitle>
          <DialogDescription>
            Choose who in this workspace can see and edit the project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Visibility</div>
            <div className="space-y-2">
              <VisibilityChoice
                current={localVisibility} value="workspace"
                onClick={() => setVisibility.mutate('workspace')}
                icon={<Globe className="h-4 w-4" />}
                title="Workspace"
                description="Every member of this workspace can see this project."
              />
              <VisibilityChoice
                current={localVisibility} value="restricted"
                onClick={() => setVisibility.mutate('restricted')}
                icon={<UserCog className="h-4 w-4" />}
                title="Specific people"
                description="Only members listed below + the workspace owner can see this project."
              />
              <VisibilityChoice
                current={localVisibility} value="private"
                onClick={() => setVisibility.mutate('private')}
                icon={<Lock className="h-4 w-4" />}
                title="Private"
                description="Only the workspace owner can see this project."
              />
            </div>
          </div>

          {localVisibility === 'restricted' && (
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Members with access</div>
              <div className="space-y-1">
                {(projectMembers.data ?? []).map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{m.displayName ?? m.email.split('@')[0]}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                    </div>
                    <Badge variant="secondary">{m.role}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => removeMember.mutate(m.userId)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {candidates.length > 0 && (
                  <div className="rounded-md border border-dashed border-border p-2 text-xs">
                    <div className="mb-2 font-medium">Add member:</div>
                    <div className="flex flex-wrap gap-1">
                      {candidates.map((c) => (
                        <Button
                          key={c.userId}
                          variant="outline"
                          size="sm"
                          onClick={() => addMember.mutate({ userId: c.userId, role: 'editor' })}
                          disabled={addMember.isPending}
                        >
                          + {c.displayName ?? c.email.split('@')[0]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VisibilityChoice({
  current, value, onClick, icon, title, description
}: {
  current: ProjectVisibility;
  value: ProjectVisibility;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
        active ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/40'
      }`}
    >
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {active && <Badge variant="success">Active</Badge>}
    </button>
  );
}
