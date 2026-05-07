import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useTeamsList, useTeamMembersList, useCreateTeam, useDeleteTeam, useToggleTeamMember } from './useTeams';
import { useTaskMembers } from '@/features/tasks/useTaskMembers';
import { toast } from '@/lib/toast';

export function TeamsCard() {
  const [newName, setNewName] = useState('');
  const { data: teams = [] } = useTeamsList();
  const { data: members = [] } = useTaskMembers();
  const create = useCreateTeam();
  const del = useDeleteTeam();
  const toggle = useToggleTeamMember();
  const [active, setActive] = useState<string | null>(null);
  const { data: activeMembers = [] } = useTeamMembersList(active);
  const memberMap = new Map(members.map((m) => [m.userId, m]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>Group workspace members. Use teams to scope task assignments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New team name"
            className="h-8"
          />
          <Button
            size="sm"
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate(newName.trim(), {
              onSuccess: () => { toast.success('Team created'); setNewName(''); }
            })}
          >
            <Plus className="mr-1 h-3 w-3" /> Create
          </Button>
        </div>
        <ul className="divide-y divide-border">
          {teams.map((t) => (
            <li key={t.id} className="py-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="text-sm font-medium hover:underline"
                  onClick={() => setActive(active === t.id ? null : t.id)}
                >
                  {t.name}
                </button>
                {t.name !== 'Everyone' && (
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => del.mutate(t.id, { onSuccess: () => toast.success('Team deleted') })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {active === t.id && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {members.map((m) => {
                    const isMember = activeMembers.some((tm) => tm.userId === m.userId);
                    return (
                      <button
                        key={m.userId}
                        type="button"
                        className={`text-left rounded border px-2 py-1 text-xs ${isMember ? 'border-primary bg-primary/10' : 'border-border'}`}
                        onClick={() => toggle.mutate({ teamId: t.id, userId: m.userId, on: !isMember })}
                      >
                        {memberMap.get(m.userId)?.displayName ?? m.email}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
