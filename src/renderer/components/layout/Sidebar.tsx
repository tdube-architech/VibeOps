import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, BookOpen, ShieldCheck, ListChecks, MessageSquare, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

const items: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/memory', label: 'Memory', icon: BookOpen },
  { to: '/audits', label: 'Audits', icon: ShieldCheck },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 flex-col border-r border-border bg-card/40 px-3 py-4">
      <div className="mb-6 px-2">
        <div className="text-base font-semibold tracking-tight">VibeOps</div>
        <div className="text-xs text-muted-foreground">Project Intelligence</div>
      </div>
      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end ?? false}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
