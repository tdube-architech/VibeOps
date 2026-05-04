import { customAlphabet } from 'nanoid';
import { slugify, ensureUniqueSlug } from '@shared/slug';
import type { Workspace, WorkspaceInput } from '@shared/types';
import type { WorkspacesRepo } from './repo';

const newId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 14);
export const DEFAULT_WORKSPACE_ID = 'ws_local';

export class WorkspacesService {
  constructor(private readonly repo: WorkspacesRepo) {}

  list(): Workspace[] { return this.repo.list(); }
  byId(id: string): Workspace | null { return this.repo.byId(id); }

  create(input: WorkspaceInput): Workspace {
    if (!input.name.trim()) throw new Error('Workspace name required.');
    const slug = ensureUniqueSlug(slugify(input.name), this.repo.takenSlugs());
    return this.repo.insert({
      id: `ws_${newId()}`,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null
    });
  }

  rename(id: string, name: string): Workspace {
    if (!name.trim()) throw new Error('Workspace name required.');
    return this.repo.rename(id, name.trim());
  }

  remove(id: string): void {
    if (id === DEFAULT_WORKSPACE_ID) throw new Error('Cannot delete the default Local Workspace.');
    this.repo.remove(id);
  }
}
