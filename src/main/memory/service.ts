import type { Memory, MemoryDraft, MemorySource, MemoryWriteResult } from '@shared/types';
import type { ProjectsService } from '@main/projects/service';
import type { ScansRepo } from '@main/scanner/repo';
import type { MemoriesRepo } from './repo';
import { generateMemory } from './generator';
import { mergeUserEditableBlocks } from './merger';
import { readMemoryFile, statMemoryFile, writeMemoryFile } from './files';

export interface GenerateOptions {
  mode?: 'fresh' | 'merge-with-disk' | 'merge-with-version';
  mergeFromVersion?: number;
}

export interface MemoryServiceDeps {
  memoriesRepo: MemoriesRepo;
  projectsService: ProjectsService;
  scansRepo: ScansRepo;
  newId: () => string;
}

export class MemoryService {
  constructor(private readonly deps: MemoryServiceDeps) {}

  async generateDraft(projectId: string, opts: GenerateOptions = {}): Promise<MemoryDraft> {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    const scan = this.deps.scansRepo.latestForProject(projectId);
    const files = scan ? this.deps.scansRepo.filesByScan(scan.id) : [];
    const envVars = scan ? this.deps.scansRepo.envVarsByScan(scan.id) : [];

    const fresh = generateMemory({ project, scan, files, envVars });

    let content = fresh;
    if (opts.mode === 'merge-with-disk') {
      const onDisk = readMemoryFile(project.localPath);
      if (onDisk) content = mergeUserEditableBlocks(fresh, onDisk);
    } else if (opts.mode === 'merge-with-version' && opts.mergeFromVersion !== undefined) {
      const versions = this.deps.memoriesRepo.list(projectId);
      const target = versions.find((m) => m.version === opts.mergeFromVersion);
      if (target) content = mergeUserEditableBlocks(fresh, target.content);
    }

    return {
      projectId,
      content,
      source: !opts.mode || opts.mode === 'fresh' ? 'generated' : 'merged',
      scanId: scan?.id ?? null
    };
  }

  saveDraft(projectId: string, content: string, source: MemorySource): Memory {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    const scan = this.deps.scansRepo.latestForProject(projectId);
    return this.deps.memoriesRepo.save({
      id: this.deps.newId(),
      projectId,
      content,
      source,
      scanId: scan?.id ?? null,
      fileWritten: false
    });
  }

  list(projectId: string): Memory[] { return this.deps.memoriesRepo.list(projectId); }
  latest(projectId: string): Memory | null { return this.deps.memoriesRepo.latest(projectId); }
  byId(id: string): Memory | null { return this.deps.memoriesRepo.byId(id); }

  fileStatus(projectId: string) {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    return statMemoryFile(project.localPath);
  }

  readFromDisk(projectId: string): string | null {
    const project = this.deps.projectsService.byId(projectId);
    if (!project) throw new Error(`project ${projectId} not found`);
    return readMemoryFile(project.localPath);
  }

  async writeFile(args: { projectId: string; memoryId: string }): Promise<MemoryWriteResult> {
    const project = this.deps.projectsService.byId(args.projectId);
    if (!project) throw new Error(`project ${args.projectId} not found`);
    const memory = this.deps.memoriesRepo.byId(args.memoryId);
    if (!memory) throw new Error(`memory ${args.memoryId} not found`);

    const result = await writeMemoryFile(project.localPath, memory.content);

    const next = this.deps.memoriesRepo.save({
      id: this.deps.newId(),
      projectId: project.id,
      content: memory.content,
      source: 'imported',
      scanId: memory.scanId,
      fileWritten: true
    });

    return { memory: next, filePath: result.filePath, backupPath: result.backupPath };
  }
}
