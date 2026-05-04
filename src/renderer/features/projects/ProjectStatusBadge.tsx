import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { ProjectStatus } from '@shared/types';

const VARIANT: Record<ProjectStatus, BadgeProps['variant']> = {
  active: 'success',
  planning: 'default',
  needs_cleanup: 'warning',
  critical: 'destructive',
  archived: 'secondary'
};

const LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  planning: 'Planning',
  needs_cleanup: 'Needs Cleanup',
  critical: 'Critical',
  archived: 'Archived'
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
