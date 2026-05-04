import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => api.data.dashboardSummary(),
    staleTime: 15_000
  });
}
