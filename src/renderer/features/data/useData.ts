import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useExportDb() {
  return useMutation({ mutationFn: () => api.data.exportDb() });
}
export function useImportDb() {
  return useMutation({ mutationFn: () => api.data.importDb() });
}
export function useClearAuditHistory() {
  return useMutation({ mutationFn: () => api.data.clearAuditHistory() });
}
export function useResetApp() {
  return useMutation({ mutationFn: () => api.data.resetApp() });
}
export function useLogs(count = 200) {
  return useQuery({ queryKey: ['logs', count], queryFn: () => api.data.tailLogs(count), refetchOnWindowFocus: false });
}
