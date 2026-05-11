import type { FindingSeverity, TaskPriority } from './types';

export const FINDING_TO_PRIORITY: Record<FindingSeverity, TaskPriority | null> = {
  critical: 'critical',
  high: 'high',
  medium: 'medium',
  low: 'low',
  info: null
};
