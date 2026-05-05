import { useAuth } from '@/features/auth/useAuth';

function initialsFor(email: string | null): string {
  if (!email) return 'U';
  const local = email.split('@')[0] ?? '';
  const first = local[0] ?? 'U';
  const last = local.split(/[._-]/).pop()?.[0] ?? '';
  return (first + last).toUpperCase().slice(0, 2);
}

export function UserFooter() {
  const { state } = useAuth();
  const user = state?.user;
  const displayName = user?.email?.split('@')[0] ?? 'Signed out';
  const subtitle = user?.email ?? 'not signed in';

  return (
    <div className="mt-auto rounded-md border border-border bg-card/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-bold">
          {initialsFor(user?.email ?? null)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
