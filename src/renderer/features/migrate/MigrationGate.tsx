import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/useAuth';
import { useActiveWorkspaceId } from '@/features/workspaces/useWorkspaces';
import { useMigrationStatus } from './useMigrate';
import { MigrationDialog } from './MigrationDialog';

const SKIP_GRACE_HOURS = 24;

function shouldAutoShow(skippedAt: string | null): boolean {
  if (!skippedAt) return true;
  const skippedMs = new Date(skippedAt).getTime();
  return Date.now() - skippedMs > SKIP_GRACE_HOURS * 60 * 60 * 1000;
}

export function MigrationGate() {
  const { state } = useAuth();
  const wsId = useActiveWorkspaceId();
  const { unmigrated, skippedAt, loading } = useMigrationStatus();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (state?.status !== 'authenticated' || !wsId) return;
    if (!unmigrated || unmigrated.length === 0) return;
    if (!shouldAutoShow(skippedAt)) return;
    setOpen(true);
  }, [loading, state?.status, wsId, unmigrated, skippedAt]);

  return <MigrationDialog open={open} onOpenChange={setOpen} />;
}
