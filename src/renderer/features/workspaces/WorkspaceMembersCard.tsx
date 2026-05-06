import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, UserPlus, Copy, X, GitBranch } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useActiveWorkspaceId } from './useWorkspaces';
import { useAuth } from '@/features/auth/useAuth';
import { toast } from '@/lib/toast';
import {
  buildAcceptInviteUrl,
  inviteMember, listMembers, listPendingInvitations,
  removeMember, revokeInvitation, updateMemberRole,
  type MemberRole
} from '@/lib/data/members';
import { listProjects } from '@/lib/data/projects';
import { grantRepoAccess, listWorkspaceGitHubStatus } from '@/lib/data/githubIntegration';

const MEMBERS_KEY = (ws: string) => ['workspace-members', ws] as const;
const INVITES_KEY = (ws: string) => ['workspace-invites', ws] as const;

const ROLES: MemberRole[] = ['owner', 'editor', 'viewer'];

function initials(email: string): string {
  const local = email.split('@')[0] ?? email;
  const parts = local.split(/[._-]/);
  return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
}

export function WorkspaceMembersCard() {
  const wsId = useActiveWorkspaceId();
  const { state } = useAuth();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor');
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);

  const validWs = !!wsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wsId);

  const members = useQuery({
    queryKey: validWs && wsId ? MEMBERS_KEY(wsId) : ['workspace-members', '__none__'],
    queryFn: () => listMembers(wsId!),
    enabled: validWs && state?.status === 'authenticated'
  });
  const invites = useQuery({
    queryKey: validWs && wsId ? INVITES_KEY(wsId) : ['workspace-invites', '__none__'],
    queryFn: () => listPendingInvitations(wsId!),
    enabled: validWs && state?.status === 'authenticated'
  });

  const invite = useMutation({
    mutationFn: ({ email, role }: { email: string; role: MemberRole }) =>
      inviteMember(wsId!, email, role),
    onSuccess: (inv) => {
      setLatestInviteUrl(buildAcceptInviteUrl(inv.token));
      setInviteEmail('');
      qc.invalidateQueries({ queryKey: INVITES_KEY(wsId!) });
      toast.success('Invitation created', 'Copy the link below and send it to the invitee.');
    },
    onError: (e) => {
      const msg = (e as Error).message;
      if (/WORKSPACE_MEMBER_LIMIT|P0001/.test(msg)) {
        toast.error('Member cap reached', 'Free workspaces allow 5 members. Upgrade or start trial in Settings → Workspace → Billing.');
      } else {
        toast.error('Invite failed', msg);
      }
    }
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVITES_KEY(wsId!) })
  });
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(wsId!, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: MEMBERS_KEY(wsId!) })
  });
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      updateMemberRole(wsId!, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: MEMBERS_KEY(wsId!) })
  });

  const myUserId = state?.user?.id;
  const myRole = members.data?.find((m) => m.userId === myUserId)?.role ?? 'viewer';
  const canInvite = myRole === 'owner' || myRole === 'editor';
  const canManageRoles = myRole === 'owner';

  const ghStatus = useQuery({
    queryKey: validWs && wsId ? ['workspace-gh-status', wsId] : ['workspace-gh-status', '__none__'],
    queryFn: () => listWorkspaceGitHubStatus(wsId!),
    enabled: validWs && state?.status === 'authenticated'
  });

  const grantAll = useMutation({
    mutationFn: async (memberId: string) => {
      const projects = await listProjects({ workspaceId: wsId! });
      const eligible = projects.filter((p) => p.repoUrl);
      const results = await Promise.all(eligible.map((p) =>
        grantRepoAccess({ projectId: p.id, memberUserId: memberId })
      ));
      return { total: eligible.length, ok: results.filter((r) => r.ok).length, results };
    },
    onSuccess: ({ total, ok, results }) => {
      if (total === 0) {
        toast.info('No repos to grant', 'No projects in this workspace have a repo_url yet.');
      } else if (ok === total) {
        toast.success('GitHub access granted', `${ok}/${total} project(s)`);
      } else {
        const firstErr = results.find((r) => !r.ok)?.error ?? 'see logs';
        toast.error(`Partial grant ${ok}/${total}`, firstErr);
      }
    },
    onError: (e) => toast.error('Grant failed', (e as Error).message)
  });

  function copyInvite() {
    if (!latestInviteUrl) return;
    void navigator.clipboard.writeText(latestInviteUrl);
    toast.info('Copied invite link');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace Members</CardTitle>
        <CardDescription>
          People who can access projects in this workspace. Cloud projects with default
          visibility are visible to all members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {/* current members */}
        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground">
            Members ({members.data?.length ?? 0})
          </div>
          {members.isLoading ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : (
            <div className="space-y-1">
              {(members.data ?? []).map((m) => {
                const ghEntry = ghStatus.data?.find((s) => s.userId === m.userId);
                return (
                <div key={m.userId} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-bold">
                    {initials(m.email)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{m.displayName ?? m.email.split('@')[0]}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {m.email}
                      {ghEntry?.githubUsername ? <> · <span className="font-mono">@{ghEntry.githubUsername}</span></> : ' · no GitHub linked'}
                    </div>
                  </div>
                  {canManageRoles && m.userId !== myUserId ? (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value as MemberRole })}
                      className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <Badge variant="secondary">{m.role}</Badge>
                  )}
                  {canManageRoles && m.userId !== myUserId && ghEntry?.githubUsername && (
                    <Button
                      variant="ghost"
                      size="sm"
                      title={`Add @${ghEntry.githubUsername} as collaborator on every project repo in this workspace`}
                      onClick={() => grantAll.mutate(m.userId)}
                      disabled={grantAll.isPending}
                    >
                      <GitBranch className="h-4 w-4" />
                    </Button>
                  )}
                  {(canManageRoles && m.userId !== myUserId && m.role !== 'owner') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Remove ${m.email} from workspace?`)) remove.mutate(m.userId);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* invitations */}
        {canInvite && (
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">Invite</div>
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <Input
                type="email"
                placeholder="teammate@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inviteEmail.trim()) {
                    invite.mutate({ email: inviteEmail, role: inviteRole });
                  }
                }}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
                {canManageRoles && <option value="owner">owner</option>}
              </select>
              <Button
                onClick={() => invite.mutate({ email: inviteEmail, role: inviteRole })}
                disabled={invite.isPending || !inviteEmail.trim()}
              >
                <UserPlus className="h-4 w-4" /> Invite
              </Button>
            </div>
            {latestInviteUrl && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
                <div className="mb-1 font-medium">Send this link to your teammate:</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background px-2 py-1">{latestInviteUrl}</code>
                  <Button size="sm" variant="outline" onClick={copyInvite}>
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </div>
                <div className="mt-1 text-muted-foreground">
                  Clicking it on a machine with VibeOps installed opens the app to accept.
                </div>
              </div>
            )}
          </div>
        )}

        {/* pending invites */}
        {invites.data && invites.data.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase text-muted-foreground">
              Pending invites ({invites.data.length})
            </div>
            <div className="space-y-1">
              {invites.data.map((i) => (
                <div key={i.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{i.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(buildAcceptInviteUrl(i.token));
                      toast.info('Copied invite link');
                    }}
                  >
                    <Copy className="h-4 w-4" /> Copy link
                  </Button>
                  {canInvite && (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(i.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
