import * as React from 'react';
import { cn } from '@/lib/utils';

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn('rounded-md border border-dashed border-border bg-card/30 p-8 text-center', className)}>
      {icon && <div className="mb-3 flex justify-center text-muted-foreground">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
