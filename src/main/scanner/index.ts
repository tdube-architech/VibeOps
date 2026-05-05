import fs from 'node:fs';
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { walkProject, safeReadText, type WalkedFile, MAX_FILE_BYTES } from './walker';
import { classifyFile, importanceScore } from './classify';
import { detectAll, type DetectorContext } from './detectors';
import { extractEnvVarNames } from './detectors/env-vars';
import { isEnvExample } from './ignore-rules';
import { buildSummary } from './summary';
import type { ScansRepo } from './repo';
import type { ProjectsService } from '@main/projects/service';
import type { Logger } from 'pino';
import type { Scan, DetectionResult, Project } from '@shared/types';
import type { ProgressEmitter } from './progress';

const newScanId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const HASH_MAX_BYTES = 1 * 1024 * 1024;

function hashFile(absPath: string): string | null {
  try {
    const stats = fs.statSync(absPath);
    if (stats.size > HASH_MAX_BYTES) return null;
    const buf = fs.readFileSync(absPath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

export interface ScanDeps {
  scansRepo: ScansRepo;
  projectsService: ProjectsService;
  logger: Logger;
}

export interface RunScanArgs {
  projectId: string;
  emitter: ProgressEmitter | null;
  signal?: AbortSignal;
}

export interface RunScanResult { scan: Scan; }

function emptyDetection(): DetectionResult {
  return { projectType: null, packageManager: null, frameworks: [], database: null, auth: null, deployment: null, primaryStack: null };
}

function buildFileRow(project: Project, scanId: string, f: WalkedFile, lastSeenAt: string) {
  const fileType = classifyFile(f.relativePath);
  const importance = importanceScore(f.relativePath);
  const hash = f.skippedReason || f.sizeBytes > HASH_MAX_BYTES ? null : hashFile(f.absolutePath);
  return {
    id: `f_${crypto.randomUUID()}`,
    projectId: project.id,
    scanId,
    path: f.relativePath,
    fileType,
    sizeBytes: f.sizeBytes,
    hash,
    importanceScore: importance,
    summary: null as string | null,
    lastSeenAt
  };
}

function buildDetectorContext(project: Project, files: WalkedFile[]): Omit<DetectorContext, 'appPrefix'> {
  const set = files.map((f) => f.relativePath);
  return {
    rootDir: project.localPath,
    files: set,
    readText: (rel) => {
      const file = files.find((f) => f.relativePath === rel);
      if (!file) return null;
      if (file.skippedReason || file.sizeBytes > MAX_FILE_BYTES) return null;
      return safeReadText(file.absolutePath, 256 * 1024);
    }
  };
}

function extractEnvVars(project: Project, scanId: string, files: WalkedFile[]) {
  const out: Array<{
    id: string;
    projectId: string;
    scanId: string;
    filename: string;
    variable: string;
    required: boolean;
    comment: string | null;
  }> = [];
  for (const f of files) {
    if (!isEnvExample(f.relativePath)) continue;
    const text = safeReadText(f.absolutePath, 64 * 1024);
    if (!text) continue;
    const extracted = extractEnvVarNames(f.relativePath, text);
    for (const v of extracted) {
      out.push({
        id: `ev_${crypto.randomUUID()}`,
        projectId: project.id,
        scanId,
        filename: v.filename,
        variable: v.variable,
        required: v.required,
        comment: v.comment
      });
    }
  }
  return out;
}

export async function runScan(deps: ScanDeps, args: RunScanArgs): Promise<RunScanResult> {
  const project = deps.projectsService.byId(args.projectId);
  if (!project) throw new Error(`project ${args.projectId} not found`);

  const scanId = `scn_${newScanId()}`;
  const startedAt = new Date().toISOString();
  deps.scansRepo.start({ id: scanId, projectId: project.id, startedAt });
  args.emitter?.setScanId(scanId);
  args.emitter?.send('walking', `Scanning ${project.localPath}…`);

  try {
    const walkOpts: { signal?: AbortSignal } = {};
    if (args.signal) walkOpts.signal = args.signal;
    const walk = await walkProject(project.localPath, walkOpts);
    args.emitter?.bump(walk.totalFiles, walk.totalBytes);
    args.emitter?.send('classifying');

    const fileRows = walk.files.map((f) => buildFileRow(project, scanId, f, startedAt));
    deps.scansRepo.insertFiles(fileRows);
    args.emitter?.bumpPersisted(fileRows.length);

    args.emitter?.send('detecting');
    const ctx = buildDetectorContext(project, walk.files);
    const detection = detectAll(ctx);

    args.emitter?.send('persisting', 'Extracting .env.example variable names…');
    const envRows = extractEnvVars(project, scanId, walk.files);
    deps.scansRepo.insertEnvVars(envRows);

    args.emitter?.send('summarizing');
    const summary = buildSummary({
      fileCount: walk.totalFiles,
      byteCount: walk.totalBytes,
      detection,
      warnings: walk.warnings
    });

    const completedAt = new Date().toISOString();
    deps.scansRepo.complete({
      id: scanId,
      status: 'completed',
      summary,
      detection,
      warnings: walk.warnings,
      fileCount: walk.totalFiles,
      byteCount: walk.totalBytes,
      completedAt
    });

    deps.projectsService.markScanned(project.id);
    deps.projectsService.setPrimaryStack(project.id, detection.primaryStack);

    args.emitter?.send('completed', summary);
    deps.logger.info({ scanId, projectId: project.id, fileCount: walk.totalFiles }, 'scan completed');

    const scan = deps.scansRepo.byId(scanId);
    if (!scan) throw new Error('scan vanished after completion');
    return { scan };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.scansRepo.complete({
      id: scanId,
      status: message === 'SCAN_CANCELED' ? 'canceled' : 'failed',
      summary: null,
      detection: emptyDetection(),
      warnings: [],
      fileCount: 0,
      byteCount: 0,
      completedAt: new Date().toISOString(),
      errorMessage: message
    });
    args.emitter?.send('failed', undefined, message);
    deps.logger.error({ scanId, projectId: project.id, err: message }, 'scan failed');
    throw err;
  }
}
