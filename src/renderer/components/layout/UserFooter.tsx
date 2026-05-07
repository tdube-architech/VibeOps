import { useAuth } from '@/features/auth/useAuth';
import { cn } from '@/lib/utils';

function initialsFor(email: string | null): string {
  if (!email) return 'U';
  const local = email.split('@')[0] ?? '';
  const first = local[0] ?? 'U';
  const last = local.split(/[._-]/).pop()?.[0] ?? '';
  return (first + last).toUpperCase().slice(0, 2);
}

type UserFooterProps = {
  collapsed?: boolean;
};

export function UserFooter({ collapsed = false }: UserFooterProps) {
  const { state } = useAuth();
  const user = state?.user;
  const displayName = user?.email?.split('@')[0] ?? 'Signed out';
  const subtitle = user?.email ?? 'not signed in';

  return (
    <div
      className={cn(
        'mt-auto rounded-md border border-border bg-card/40',
        collapsed ? 'p-1' : 'px-3 py-2'
      )}
      title={collapsed ? `${displayName} — ${subtitle}` : undefined}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-2')}>
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold">
          {initialsFor(user?.email ?? null)}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="t-menu truncate">{displayName}</div>
            <div className="t-meta truncate">{subtitle}</div>
          </div>
        )}
      </div>
    </div>
  );
}
