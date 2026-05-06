import { useProjectPresence } from './useProjectPresence';

function initials(email: string): string {
  const local = email.split('@')[0] ?? email;
  return ((local[0] ?? 'U') + (local.split(/[._-]/)[1]?.[0] ?? '')).toUpperCase().slice(0, 2);
}

export function PresenceStack({ projectId }: { projectId: string | undefined }) {
  const others = useProjectPresence(projectId);
  if (others.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {others.slice(0, 5).map((u) => (
          <div
            key={u.userId}
            title={`${u.displayName ?? u.email} is viewing this project`}
            className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-secondary text-[10px] font-bold"
          >
            {initials(u.email)}
          </div>
        ))}
        {others.length > 5 && (
          <div className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-muted text-[10px] font-bold">
            +{others.length - 5}
          </div>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {others.length} {others.length === 1 ? 'person' : 'people'} viewing
      </span>
    </div>
  );
}
