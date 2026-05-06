import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { UpdateState } from '@shared/types';

export function useUpdateState() {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => api.update.onState(setState), []);
  return state;
}

export function useCheckUpdate() {
  return useMutation({ mutationFn: () => api.update.check() });
}
export function useDownloadUpdate() {
  return useMutation({ mutationFn: () => api.update.download() });
}
export function useInstallUpdate() {
  return useMutation({ mutationFn: () => api.update.install() });
}
export function useOpenInstallerManually() {
  return useMutation({ mutationFn: () => api.update.openInstaller() });
}
