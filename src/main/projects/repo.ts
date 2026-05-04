import { and, desc, eq, like, ne, or, asc } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projects, type ProjectRow } from '@main/db/schema';
import type {
  Project,
  ProjectPatch,
  ProjectListQuery,
  ProjectStatus
} from '@shared/types';

interface InsertParams {
  id: string;
  name: string;
  slug: string;
  localPath: string;
  description?: string | null;
  category?: string | null;
  status?: ProjectStatus;
  tags?: string[];
  repoUrl?: string | null;
  primaryStack?: string | null;
  workspaceId?: string;
}

function rowToProject(row: ProjectRow): Project {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags ?? '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    localPath: row.localPath,
    repoUrl: row.repoUrl,
    category: row.category,
    status: (row.status as ProjectStatus) ?? 'active',
    primaryStack: row.primaryStack,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastScannedAt: row.lastScannedAt,
    lastAuditedAt: row.lastAuditedAt,
    workspaceId: row.workspaceId ?? 'ws_local'
  };
}

export class ProjectsRepo {
  constructor(private readonly db: Db) {}

  insert(params: InsertParams): Project {
    const now = new Date().toISOString();
    this.db.insert(projects).values({
      id: params.id,
      name: params.name,
      slug: params.slug,
      description: params.description ?? null,
      localPath: params.localPath,
      repoUrl: params.repoUrl ?? null,
      category: params.category ?? null,
      status: params.status ?? 'active',
      primaryStack: params.primaryStack ?? null,
      tags: JSON.stringify(params.tags ?? []),
      createdAt: now,
      updatedAt: now,
      lastScannedAt: null,
      lastAuditedAt: null,
      workspaceId: params.workspaceId ?? 'ws_local'
    }).run();
    const row = this.byId(params.id);
    if (!row) throw new Error('insert succeeded but row missing');
    return row;
  }

  byId(id: string): Project | null {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
    return row ? rowToProject(row) : null;
  }

  byPath(localPath: string): Project | null {
    const row = this.db.select().from(projects).where(eq(projects.localPath, localPath)).get();
    return row ? rowToProject(row) : null;
  }

  takenSlugs(): Set<string> {
    const rows = this.db.select({ slug: projects.slug }).from(projects).all();
    return new Set(rows.map((r) => r.slug));
  }

  list(q: ProjectListQuery): Project[] {
    const conditions = [];
    if (!q.includeArchived) conditions.push(ne(projects.status, 'archived'));
    if (q.status && q.status !== 'all') conditions.push(eq(projects.status, q.status));
    if (q.workspaceId) conditions.push(eq(projects.workspaceId, q.workspaceId));
    if (q.search && q.search.trim().length > 0) {
      const pat = `%${q.search.trim().toLowerCase()}%`;
      conditions.push(or(like(projects.name, pat), like(projects.localPath, pat))!);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const primaryOrder =
      q.sort === 'name' ? asc(projects.name)
      : q.sort === 'lastScanned' ? desc(projects.lastScannedAt)
      : desc(projects.createdAt);
    const tieBreaker = desc(projects.id);

    const rows = where
      ? this.db.select().from(projects).where(where).orderBy(primaryOrder, tieBreaker).all()
      : this.db.select().from(projects).orderBy(primaryOrder, tieBreaker).all();

    return rows.map(rowToProject);
  }

  update(patch: ProjectPatch): Project {
    const set: Partial<ProjectRow> = { updatedAt: new Date().toISOString() };
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
    if (patch.repoUrl !== undefined) set.repoUrl = patch.repoUrl;
    this.db.update(projects).set(set).where(eq(projects.id, patch.id)).run();
    const row = this.byId(patch.id);
    if (!row) throw new Error(`project ${patch.id} not found after update`);
    return row;
  }

  archive(id: string): Project {
    return this.update({ id, status: 'archived' });
  }

  unarchive(id: string): Project {
    return this.update({ id, status: 'active' });
  }

  remove(id: string): void {
    this.db.delete(projects).where(eq(projects.id, id)).run();
  }

  markScanned(id: string, when: string): void {
    this.db.update(projects).set({ lastScannedAt: when, updatedAt: when }).where(eq(projects.id, id)).run();
  }

  setPrimaryStack(id: string, stack: string | null): void {
    this.db.update(projects).set({ primaryStack: stack, updatedAt: new Date().toISOString() }).where(eq(projects.id, id)).run();
  }
}
