import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AppInfo } from '@shared/types';

export function Topbar() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    api.getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);
  const built = formatBuildTimestamp(info?.buildTimestamp ?? '');
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/30 px-4">
      <div className="text-sm text-muted-foreground">
        {info
          ? <>v{info.displayVersion} · electron {info.electronVersion}{built ? ` · built ${built}` : ''}</>
          : 'loading…'}
      </div>
    </header>
  );
}

function formatBuildTimestamp(ts: string): string | null {
  // ts is `MMDDHHMM` UTC. Render as "MM/DD HH:mm UTC".
  if (!/^\d{8}$/.test(ts)) return null;
  return `${ts.slice(0, 2)}/${ts.slice(2, 4)} ${ts.slice(4, 6)}:${ts.slice(6, 8)} UTC`;
}
