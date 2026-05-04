import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AppSettings, AIProviderId } from '@shared/types';
import type { ProjectAnalysisResult } from '@shared/ai';

const settingsKey = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsKey, queryFn: () => api.settings.read() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.settings.update(patch),
    onSuccess: (s) => qc.setQueryData(settingsKey, s)
  });
}

export function useSetApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ providerId, apiKey }: { providerId: AIProviderId; apiKey: string }) =>
      api.settings.setApiKey(providerId, apiKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey })
  });
}

export function useClearApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: AIProviderId) => api.settings.clearApiKey(providerId),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKey })
  });
}

export function useTestConnection() {
  return useMutation({ mutationFn: (providerId: AIProviderId) => api.ai.testConnection(providerId) });
}

export function useGenerateProjectSummary() {
  return useMutation<ProjectAnalysisResult, Error, string>({
    mutationFn: (projectId: string) => api.ai.generateProjectSummary(projectId)
  });
}
