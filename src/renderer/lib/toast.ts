import { toast as sonner } from 'sonner';

export const toast = {
  success: (msg: string, description?: string) => sonner.success(msg, description ? { description } : undefined),
  error: (msg: string, description?: string) => sonner.error(msg, description ? { description } : undefined),
  info: (msg: string, description?: string) => sonner.message(msg, description ? { description } : undefined)
};
