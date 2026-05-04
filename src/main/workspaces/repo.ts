import { eq, asc } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { workspaces, type WorkspaceRow } from '@main/db/schema';
import type { Workspace } from '@shared/types';

function toWs(row: WorkspaceRow): Workspace {
  return {
    id: row.id, name: row.name, slug: row.slug, description: row.description,
    createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

export class WorkspacesRepo {
  constructor(private readonly db: Db) {}

  insert(args: { id: string; name: string; slug: string; description: string | null }): Workspace {
    const now = new Date().toISOString();
    this.db.insert(workspaces).values({ ...args, createdAt: now, updatedAt: now }).run();
    return this.byId(args.id)!;
  }

  byId(id: string): Workspace | null {
    const row = this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();
    return row ? toWs(row) : null;
  }

  list(): Workspace[] {
    return this.db.select().from(workspaces).orderBy(asc(workspaces.createdAt)).all().map(toWs);
  }

  takenSlugs(): Set<string> {
    return new Set(this.db.select({ slug: workspaces.slug }).from(workspaces).all().map((r) => r.slug));
  }

  rename(id: string, name: string): Workspace {
    this.db.update(workspaces).set({ name, updatedAt: new Date().toISOString() }).where(eq(workspaces.id, id)).run();
    return this.byId(id)!;
  }

  remove(id: string): void {
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run();
  }
}
