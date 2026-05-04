import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@main/db/client';
import { projectScans, projectFiles, projectEnvVars, type ProjectScanRow, type ProjectFileRow, type ProjectEnvVarRow } from '@main/db/schema';
import type { Scan, ScanFile, ScanEnvVar, ScanStatus, ScanWarning, DetectionResult } from '@shared/types';

function rowToScan(row: ProjectScanRow): Scan {
  let frameworks: string[] = [];
  let warnings: ScanWarning[] = [];
  try { frameworks = JSON.parse(row.detectedFrameworks); } catch { frameworks = []; }
  try { warnings = JSON.parse(row.warnings); } catch { warnings = []; }
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status as ScanStatus,
    summary: row.summary,
    detection: {
      projectType: null,
      packageManager: row.detectedPackageManager,
      frameworks,
      database: row.detectedDatabase,
      auth: row.detectedAuth,
      deployment: row.detectedDeployment,
      primaryStack: row.detectedStack
    },
    warnings,
    fileCount: row.fileCount,
    byteCount: row.byteCount,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorMessage: row.errorMessage
  };
}

function rowToFile(row: ProjectFileRow): ScanFile {
  return {
    id: row.id,
    projectId: row.projectId,
    scanId: row.scanId,
    path: row.path,
    fileType: row.fileType as ScanFile['fileType'],
    sizeBytes: row.sizeBytes,
    hash: row.hash,
    importanceScore: row.importanceScore,
    summary: row.summary,
    lastSeenAt: row.lastSeenAt
  };
}

function rowToEnv(row: ProjectEnvVarRow): ScanEnvVar {
  return {
    id: row.id,
    projectId: row.projectId,
    scanId: row.scanId,
    filename: row.filename,
    variable: row.variable,
    required: row.required,
    comment: row.comment
  };
}

export interface InsertScanArgs {
  id: string;
  projectId: string;
  startedAt: string;
}

export interface CompleteScanArgs {
  id: string;
  status: ScanStatus;
  summary: string | null;
  detection: DetectionResult;
  warnings: ScanWarning[];
  fileCount: number;
  byteCount: number;
  completedAt: string;
  errorMessage?: string | null;
}

export class ScansRepo {
  constructor(private readonly db: Db) {}

  start(args: InsertScanArgs): void {
    this.db.insert(projectScans).values({
      id: args.id,
      projectId: args.projectId,
      status: 'running',
      summary: null,
      detectedStack: null,
      detectedFrameworks: '[]',
      detectedPackageManager: null,
      detectedDatabase: null,
      detectedAuth: null,
      detectedDeployment: null,
      warnings: '[]',
      fileCount: 0,
      byteCount: 0,
      startedAt: args.startedAt,
      completedAt: null,
      errorMessage: null
    }).run();
  }

  complete(args: CompleteScanArgs): void {
    this.db.update(projectScans).set({
      status: args.status,
      summary: args.summary,
      detectedStack: args.detection.primaryStack,
      detectedFrameworks: JSON.stringify(args.detection.frameworks),
      detectedPackageManager: args.detection.packageManager,
      detectedDatabase: args.detection.database,
      detectedAuth: args.detection.auth,
      detectedDeployment: args.detection.deployment,
      warnings: JSON.stringify(args.warnings),
      fileCount: args.fileCount,
      byteCount: args.byteCount,
      completedAt: args.completedAt,
      errorMessage: args.errorMessage ?? null
    }).where(eq(projectScans.id, args.id)).run();
  }

  byId(id: string): Scan | null {
    const row = this.db.select().from(projectScans).where(eq(projectScans.id, id)).get();
    return row ? rowToScan(row) : null;
  }

  listByProject(projectId: string): Scan[] {
    const rows = this.db.select().from(projectScans).where(eq(projectScans.projectId, projectId))
      .orderBy(desc(projectScans.startedAt)).all();
    return rows.map(rowToScan);
  }

  latestForProject(projectId: string): Scan | null {
    const row = this.db.select().from(projectScans)
      .where(and(eq(projectScans.projectId, projectId), eq(projectScans.status, 'completed')))
      .orderBy(desc(projectScans.completedAt)).get();
    return row ? rowToScan(row) : null;
  }

  insertFiles(rows: ProjectFileRow[]): void {
    if (rows.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      this.db.insert(projectFiles).values(rows.slice(i, i + chunkSize)).run();
    }
  }

  insertEnvVars(rows: ProjectEnvVarRow[]): void {
    if (rows.length === 0) return;
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      this.db.insert(projectEnvVars).values(rows.slice(i, i + chunkSize)).run();
    }
  }

  filesByScan(scanId: string): ScanFile[] {
    const rows = this.db.select().from(projectFiles)
      .where(eq(projectFiles.scanId, scanId))
      .orderBy(desc(projectFiles.importanceScore)).all();
    return rows.map(rowToFile);
  }

  envVarsByScan(scanId: string): ScanEnvVar[] {
    const rows = this.db.select().from(projectEnvVars).where(eq(projectEnvVars.scanId, scanId)).all();
    return rows.map(rowToEnv);
  }
}
