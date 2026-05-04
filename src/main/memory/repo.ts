import { desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projectMemories, type ProjectMemoryRow } from '@main/db/schema';
import type { Memory, MemorySource } from '@shared/types';

function rowToMemory(row: ProjectMemoryRow): Memory {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    content: row.content,
    source: row.source as MemorySource,
    fileWritten: row.fileWritten,
    scanId: row.scanId,
    createdAt: row.createdAt
  };
}

export interface SaveMemoryArgs {
  id: string;
  projectId: string;
  content: string;
  source: MemorySource;
  scanId: string | null;
  fileWritten: boolean;
}

export class MemoriesRepo {
  constructor(private readonly db: Db) {}

  save(args: SaveMemoryArgs): Memory {
    const last = this.latest(args.projectId);
    const version = (last?.version ?? 0) + 1;
    const createdAt = new Date().toISOString();
    this.db.insert(projectMemories).values({
      id: args.id,
      projectId: args.projectId,
      version,
      content: args.content,
      source: args.source,
      fileWritten: args.fileWritten,
      scanId: args.scanId,
      createdAt
    }).run();
    const row = this.db.select().from(projectMemories).where(eq(projectMemories.id, args.id)).get();
    if (!row) throw new Error('memory vanished after insert');
    return rowToMemory(row);
  }

  byId(id: string): Memory | null {
    const row = this.db.select().from(projectMemories).where(eq(projectMemories.id, id)).get();
    return row ? rowToMemory(row) : null;
  }

  list(projectId: string): Memory[] {
    return this.db.select().from(projectMemories)
      .where(eq(projectMemories.projectId, projectId))
      .orderBy(desc(projectMemories.version)).all().map(rowToMemory);
  }

  latest(projectId: string): Memory | null {
    const row = this.db.select().from(projectMemories)
      .where(eq(projectMemories.projectId, projectId))
      .orderBy(desc(projectMemories.version)).get();
    return row ? rowToMemory(row) : null;
  }
}
