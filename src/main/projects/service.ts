import fs from 'node:fs';
import path from 'node:path';
import type { Project, ProjectInput, ProjectListQuery, ProjectPatch } from '@shared/types';
import { slugify, ensureUniqueSlug } from '@shared/slug';
import { newProjectId } from './ids';
import type { ProjectsRepo } from './repo';

export class DuplicatePathError extends Error {
  readonly code = 'DUPLICATE_PATH';
  constructor(public readonly existing: Project) {
    super(`Path already registered as project ${existing.id}`);
  }
}

export class InvalidPathError extends Error {
  readonly code = 'INVALID_PATH';
  constructor(message: string) { super(message); }
}

export interface AddProjectOptions {
  allowDuplicate?: boolean;
}

export class ProjectsService {
  constructor(private readonly repo: ProjectsRepo) {}

  list(q: ProjectListQuery): Project[] {
    return this.repo.list(q);
  }

  byId(id: string): Project | null {
    return this.repo.byId(id);
  }

  add(input: ProjectInput, opts: AddProjectOptions = {}): Project {
    const normalizedPath = path.resolve(input.localPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(normalizedPath);
    } catch {
      throw new InvalidPathError(`Path does not exist: ${normalizedPath}`);
    }
    if (!stat.isDirectory()) {
      throw new InvalidPathError(`Not a directory: ${normalizedPath}`);
    }

    if (!opts.allowDuplicate) {
      const existing = this.repo.byPath(normalizedPath);
      if (existing) throw new DuplicatePathError(existing);
    }

    const baseSlug = slugify(input.name);
    const slug = ensureUniqueSlug(baseSlug, this.repo.takenSlugs());

    return this.repo.insert({
      id: newProjectId(),
      name: input.name.trim(),
      slug,
      localPath: normalizedPath,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      status: input.status ?? 'active',
      tags: input.tags ?? [],
      repoUrl: input.repoUrl?.trim() || null,
      workspaceId: input.workspaceId ?? 'ws_local'
    });
  }

  update(patch: ProjectPatch): Project {
    return this.repo.update(patch);
  }

  archive(id: string): Project {
    return this.repo.archive(id);
  }

  unarchive(id: string): Project {
    return this.repo.unarchive(id);
  }

  remove(id: string): void {
    this.repo.remove(id);
  }

  pathExists(localPath: string): Project | null {
    return this.repo.byPath(path.resolve(localPath));
  }

  markScanned(id: string): void {
    this.repo.markScanned(id, new Date().toISOString());
  }

  markAudited(id: string): void {
    this.repo.markAudited(id, new Date().toISOString());
  }

  setPrimaryStack(id: string, stack: string | null): void {
    this.repo.setPrimaryStack(id, stack);
  }
}
