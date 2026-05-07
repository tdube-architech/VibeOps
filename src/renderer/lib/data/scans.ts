import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type {
  Scan, ScanFile, ScanEnvVar, ScanStatus, ScanWarning,
  DetectionResult, FileType
} from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isCloud(id: string): boolean { return UUID_RE.test(id); }

// =====================================================================
// Cloud row types (from Supabase)
// =====================================================================

interface ProjectScanRow {
  id: string;
  project_id: string;
  workspace_id: string;
  started_at: string | null;
  completed_at: string | null;
  primary_stack: string | null;
  file_count: number | null;
  env_var_count: number | null;
  summary: ScanSummary | null;
  scanned_by: string | null;
  created_at: string;
}

interface ProjectScanFileRow {
  id: string;
  scan_id: string;
  path: string | null;
  language: string | null;
  size_bytes: number | null;
  sha256: string | null;
  role: string | null;
}

interface ProjectScanEnvVarRow {
  id: string;
  scan_id: string;
  name: string | null;
  file: string | null;
  line: number | null;
}

/**
 * Shape we serialize into the project_scans.summary jsonb column. This is the
 * portion of the local Scan row that doesn't have a dedicated cloud column,
 * so user B can reconstruct a fully-populated Scan object without re-running.
 */
interface ScanSummary {
  status: ScanStatus;
  summary: string | null;
  detection: DetectionResult;
  warnings: ScanWarning[];
  byteCount: number;
  errorMessage: string | null;
  // Per-file extras that don't fit the cloud schema cleanly
  files?: Array<{ id: string; importanceScore: number; summary: string | null; lastSeenAt: string }>;
  envVars?: Array<{ id: string; required: boolean; comment: string | null }>;
}

// =====================================================================
// Row → domain mappers
// =====================================================================

function defaultDetection(): DetectionResult {
  return {
    projectType: null,
    packageManager: null,
    frameworks: [],
    database: null,
    auth: null,
    deployment: null,
    primaryStack: null
  };
}

function rowToScan(row: ProjectScanRow): Scan {
  const s = row.summary;
  const detection: DetectionResult = s?.detection ?? {
    ...defaultDetection(),
    primaryStack: row.primary_stack
  };
  return {
    id: row.id,
    projectId: row.project_id,
    status: s?.status ?? 'completed',
    summary: s?.summary ?? null,
    detection,
    warnings: s?.warnings ?? [],
    fileCount: row.file_count ?? 0,
    byteCount: s?.byteCount ?? 0,
    startedAt: row.started_at ?? row.created_at,
    completedAt: row.completed_at,
    errorMessage: s?.errorMessage ?? null
  };
}

function rowToScanFile(
  row: ProjectScanFileRow,
  projectId: string,
  extras?: ScanSummary['files']
): ScanFile {
  const extra = extras?.find((e) => e.id === row.id);
  return {
    id: row.id,
    projectId,
    scanId: row.scan_id,
    path: row.path ?? '',
    fileType: (row.language as FileType) ?? 'unknown',
    sizeBytes: row.size_bytes ?? 0,
    hash: row.sha256,
    importanceScore: extra?.importanceScore ?? 0,
    summary: extra?.summary ?? null,
    lastSeenAt: extra?.lastSeenAt ?? row.scan_id // fallback; real value lives in extras
  };
}

function rowToScanEnvVar(
  row: ProjectScanEnvVarRow,
  projectId: string,
  extras?: ScanSummary['envVars']
): ScanEnvVar {
  const extra = extras?.find((e) => e.id === row.id);
  return {
    id: row.id,
    projectId,
    scanId: row.scan_id,
    filename: row.file ?? '',
    variable: row.name ?? '',
    required: extra?.required ?? true,
    comment: extra?.comment ?? null
  };
}

// =====================================================================
// Reads
// =====================================================================

/**
 * Latest completed scan for a cloud project, with files + env vars hydrated.
 * Mirrors the shape of the local IPC chain (api.scans.latest + .files + .envVars).
 */
export async function latestCloudScan(projectId: string): Promise<{
  scan: Scan | null;
  files: ScanFile[];
  envVars: ScanEnvVar[];
}> {
  if (!isCloud(projectId)) {
    const scan = await api.scans.latest(projectId);
    if (!scan) return { scan: null, files: [], envVars: [] };
    const [files, envVars] = await Promise.all([
      api.scans.files(scan.id),
      api.scans.envVars(scan.id)
    ]);
    return { scan, files, envVars };
  }

  const supabase = getSupabase();
  const { data: scanRow, error } = await supabase
    .from('project_scans')
    .select('*')
    .eq('project_id', projectId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!scanRow) return { scan: null, files: [], envVars: [] };

  const row = scanRow as ProjectScanRow;
  const scan = rowToScan(row);

  const [filesRes, envRes] = await Promise.all([
    supabase.from('project_scan_files').select('*').eq('scan_id', row.id),
    supabase.from('project_scan_env_vars').select('*').eq('scan_id', row.id)
  ]);
  if (filesRes.error) throw new Error(filesRes.error.message);
  if (envRes.error) throw new Error(envRes.error.message);

  const files = ((filesRes.data ?? []) as ProjectScanFileRow[]).map(
    (r) => rowToScanFile(r, projectId, row.summary?.files)
  );
  const envVars = ((envRes.data ?? []) as ProjectScanEnvVarRow[]).map(
    (r) => rowToScanEnvVar(r, projectId, row.summary?.envVars)
  );
  return { scan, files, envVars };
}

/**
 * Just the scan header (no files / env vars). Compatible with the existing
 * `useLatestScan` query shape.
 */
export async function latestCloudScanHeader(projectId: string): Promise<Scan | null> {
  if (!isCloud(projectId)) return api.scans.latest(projectId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_scans')
    .select('*')
    .eq('project_id', projectId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return rowToScan(data as ProjectScanRow);
}

/**
 * List historical scans for a project (newest first). Header only.
 */
export async function listCloudScans(projectId: string): Promise<Scan[]> {
  if (!isCloud(projectId)) return api.scans.list(projectId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_scans')
    .select('*')
    .eq('project_id', projectId)
    .order('completed_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as ProjectScanRow[]).map(rowToScan);
}

export async function listCloudScanFiles(
  projectId: string,
  scanId: string
): Promise<ScanFile[]> {
  if (!isCloud(scanId)) return api.scans.files(scanId);
  const supabase = getSupabase();
  // We need the parent summary for extras; fetch in parallel.
  const [parent, files] = await Promise.all([
    supabase.from('project_scans').select('summary').eq('id', scanId).maybeSingle(),
    supabase.from('project_scan_files').select('*').eq('scan_id', scanId)
  ]);
  if (parent.error) throw new Error(parent.error.message);
  if (files.error) throw new Error(files.error.message);
  const summary = (parent.data as { summary: ScanSummary | null } | null)?.summary ?? null;
  return ((files.data ?? []) as ProjectScanFileRow[]).map(
    (r) => rowToScanFile(r, projectId, summary?.files)
  );
}

export async function listCloudScanEnvVars(
  projectId: string,
  scanId: string
): Promise<ScanEnvVar[]> {
  if (!isCloud(scanId)) return api.scans.envVars(scanId);
  const supabase = getSupabase();
  const [parent, envs] = await Promise.all([
    supabase.from('project_scans').select('summary').eq('id', scanId).maybeSingle(),
    supabase.from('project_scan_env_vars').select('*').eq('scan_id', scanId)
  ]);
  if (parent.error) throw new Error(parent.error.message);
  if (envs.error) throw new Error(envs.error.message);
  const summary = (parent.data as { summary: ScanSummary | null } | null)?.summary ?? null;
  return ((envs.data ?? []) as ProjectScanEnvVarRow[]).map(
    (r) => rowToScanEnvVar(r, projectId, summary?.envVars)
  );
}

// =====================================================================
// Writes
// =====================================================================

/**
 * Bulk-mirror a completed local scan to Supabase so workspace teammates see it.
 * Idempotent on (project_id, completed_at): if a row already exists for the
 * same completion timestamp, we delete it (cascading to files + env vars)
 * before inserting the fresh copy.
 *
 * No-op for non-cloud (legacy local) project IDs.
 */
export async function publishScanResult(
  projectId: string,
  workspaceId: string | undefined,
  scan: Scan,
  files: ScanFile[],
  envVars: ScanEnvVar[]
): Promise<void> {
  if (!isCloud(projectId)) return;
  if (!scan.completedAt) return; // only mirror finished scans
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');

  let wsId = workspaceId;
  if (!wsId) {
    const { data: p } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle();
    wsId = (p as { workspace_id: string } | null)?.workspace_id;
    if (!wsId) throw new Error('Could not resolve workspace_id for project');
  }

  // Idempotency: drop any existing mirror for the same (project_id, completed_at).
  // The unique index on (project_id, completed_at) would otherwise reject the
  // insert below. Files + env vars cascade via FK on delete.
  await supabase
    .from('project_scans')
    .delete()
    .eq('project_id', projectId)
    .eq('completed_at', scan.completedAt);

  const summary: ScanSummary = {
    status: scan.status,
    summary: scan.summary,
    detection: scan.detection,
    warnings: scan.warnings,
    byteCount: scan.byteCount,
    errorMessage: scan.errorMessage,
    files: files.map((f) => ({
      id: f.id, // local id; rewritten below to the cloud row id
      importanceScore: f.importanceScore,
      summary: f.summary,
      lastSeenAt: f.lastSeenAt
    })),
    envVars: envVars.map((v) => ({
      id: v.id,
      required: v.required,
      comment: v.comment
    }))
  };

  const { data: insertedScan, error: insertErr } = await supabase
    .from('project_scans')
    .insert({
      project_id: projectId,
      workspace_id: wsId,
      started_at: scan.startedAt,
      completed_at: scan.completedAt,
      primary_stack: scan.detection.primaryStack,
      file_count: scan.fileCount,
      env_var_count: envVars.length,
      summary,
      scanned_by: u.user.id
    })
    .select('id')
    .single();
  if (insertErr) throw new Error(insertErr.message);
  const scanId = (insertedScan as { id: string }).id;

  // Insert files in chunks so we don't slam the request size limit on huge
  // monorepos. We build minimal row payloads — the per-file "extras" already
  // live in the parent's summary jsonb keyed by local id, so teammates can
  // still see importance/summary while the cloud table stays narrow.
  if (files.length > 0) {
    const fileRows = files.map((f) => ({
      scan_id: scanId,
      path: f.path,
      language: f.fileType,
      size_bytes: f.sizeBytes,
      sha256: f.hash,
      role: f.fileType
    }));
    for (let i = 0; i < fileRows.length; i += 250) {
      const chunk = fileRows.slice(i, i + 250);
      const { error: fErr } = await supabase.from('project_scan_files').insert(chunk);
      if (fErr) throw new Error(fErr.message);
    }
  }

  if (envVars.length > 0) {
    const envRows = envVars.map((v) => ({
      scan_id: scanId,
      name: v.variable,
      file: v.filename,
      line: null
    }));
    const { error: eErr } = await supabase.from('project_scan_env_vars').insert(envRows);
    if (eErr) throw new Error(eErr.message);
  }
}
