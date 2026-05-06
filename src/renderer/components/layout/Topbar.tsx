import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AppInfo } from '@shared/types';

export function Topbar() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    api.getAppInfo().then(setInfo).catch(() => setInfo(null));
  }, []);
  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-card/30 px-4">
      <div className="text-sm text-muted-foreground">
        {info ? `v${info.displayVersion} · electron ${info.electronVersion}` : 'loading…'}
      </div>
    </header>
  );
}
