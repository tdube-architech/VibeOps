import { getSupabase } from '@/lib/supabase';
import { api } from '@/lib/api';
import type { AuditRun, AuditFinding, FindingSeverity, FindingCategory, AuditStatus, AuditType, RiskLevel } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isCloud(id: string): boolean { return UUID_RE.test(id); }

interface RunRow {
  id: string;
  project_id: string;
  workspace_id: string;
  audit_type: AuditType;
  status: AuditStatus;
  score: number | null;
  risk_level: string | null;
  summary: string | null;
  recommended_next_action: string | null;
  generated_prompt: string | null;
  provider: string | null;
  model: string | null;
  run_by_user_id: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  git_commit_sha: string | null;
}

interface FindingRow {
  id: string;
  audit_run_id: string;
  project_id: string;
  workspace_id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  title: string;
  description: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  recommendation: string | null;
  suggested_prompt: string | null;
  status: AuditFinding['status'];
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  version?: number;
}

function rowToRun(row: RunRow, findings: AuditFinding[] = []): AuditRun {
  return {
    id: row.id,
    projectId: row.project_id,
    scanId: null,
    auditType: row.audit_type,
    provider: row.provider,
    model: row.model,
    status: row.status,
    score: row.score,
    riskLevel: (row.risk_level as RiskLevel | null),
    summary: row.summary,
    recommendedNextAction: row.recommended_next_action,
    generatedPromptId: null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    findings
  };
}

function rowToFinding(row: FindingRow): AuditFinding {
  const f: AuditFinding = {
    id: row.id,
    auditRunId: row.audit_run_id,
    projectId: row.project_id,
    severity: row.severity,
    category: row.category,
    title: row.title,
    description: row.description,
    filePath: row.file_path,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    recommendation: row.recommendation,
    suggestedPrompt: row.suggested_prompt,
    status: row.status,
    createdAt: row.created_at
  };
  if (row.version !== undefined) f.version = row.version;
  return f;
}

export async function listAudits(projectId: string): Promise<AuditRun[]> {
  if (!isCloud(projectId)) return api.audits.list(projectId);
  const supabase = getSupabase();
  const { data: runs, error } = await supabase
    .from('audit_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false });
  if (error) throw new Error(error.message);
  if (!runs?.length) return [];
  const ids = runs.map((r) => r.id);
  const { data: findings } = await supabase
    .from('audit_findings')
    .select('*')
    .in('audit_run_id', ids);
  const byRun = new Map<string, AuditFinding[]>();
  for (const f of (findings ?? []) as FindingRow[]) {
    const arr = byRun.get(f.audit_run_id) ?? [];
    arr.push(rowToFinding(f));
    byRun.set(f.audit_run_id, arr);
  }
  return (runs as RunRow[]).map((r) => rowToRun(r, byRun.get(r.id) ?? []));
}

export async function latestAudit(projectId: string): Promise<AuditRun | null> {
  if (!isCloud(projectId)) return api.audits.latest(projectId);
  const supabase = getSupabase();
  const { data: run, error } = await supabase
    .from('audit_runs')
    .select('*')
    .eq('project_id', projectId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!run) return null;
  const { data: findings } = await supabase
    .from('audit_findings')
    .select('*')
    .eq('audit_run_id', (run as RunRow).id);
  const f = (findings ?? []) as FindingRow[];
  return rowToRun(run as RunRow, f.map(rowToFinding));
}

export async function listFindings(auditRunId: string): Promise<AuditFinding[]> {
  if (!isCloud(auditRunId)) return api.audits.findings(auditRunId);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audit_findings')
    .select('*')
    .eq('audit_run_id', auditRunId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as FindingRow[]).map(rowToFinding);
}

export class FindingConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  constructor() { super('finding was modified by another user'); }
}

export async function updateFindingStatus(
  finding: { id: string; status: AuditFinding['status']; expectedVersion?: number }
): Promise<AuditFinding | null> {
  if (!isCloud(finding.id)) return api.audits.updateFinding(finding.id, finding.status);
  const supabase = getSupabase();

  if (finding.expectedVersion === undefined) {
    const update: Record<string, unknown> = { status: finding.status };
    if (finding.status === 'fixed' || finding.status === 'wont-fix') {
      update.resolved_at = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();
      if (u.user) update.resolved_by_user_id = u.user.id;
    } else {
      update.resolved_at = null;
      update.resolved_by_user_id = null;
    }
    const { data, error } = await supabase
      .from('audit_findings').update(update).eq('id', finding.id)
      .select('*').single();
    if (error) throw new Error(error.message);
    return rowToFinding(data as FindingRow);
  }

  const { data, error } = await supabase.rpc('update_finding_status_versioned', {
    finding_id: finding.id,
    expected_version: finding.expectedVersion,
    new_status: finding.status
  });
  if (error) {
    if (/VERSION_CONFLICT|P0012/.test(error.message)) throw new FindingConflictError();
    throw new Error(error.message);
  }
  return rowToFinding(data as FindingRow);
}

export class AuditInFlightError extends Error {
  readonly code = 'AUDIT_IN_FLIGHT';
  constructor(public readonly runBy: string | null, public readonly startedAt: string | null) {
    super('Another audit is already running on this project');
  }
}

export interface InFlightAudit {
  id: string;
  runByUserId: string;
  runByEmail: string | null;
  runByDisplayName: string | null;
  startedAt: string;
}

export async function fetchInFlightAudit(projectId: string): Promise<InFlightAudit | null> {
  if (!isCloud(projectId)) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('audit_runs')
    .select('id, run_by_user_id, started_at')
    .eq('project_id', projectId)
    .eq('status', 'running')
    .gt('started_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { id: string; run_by_user_id: string; started_at: string };

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, display_name')
    .eq('user_id', row.run_by_user_id)
    .maybeSingle();
  const p = profile as { email: string; display_name: string | null } | null;

  return {
    id: row.id,
    runByUserId: row.run_by_user_id,
    runByEmail: p?.email ?? null,
    runByDisplayName: p?.display_name ?? null,
    startedAt: row.started_at
  };
}

/**
 * Acquire a server-side lock by inserting an audit_runs row with status='running'.
 * Throws AuditInFlightError if another run is active.
 */
export async function claimAuditRun(
  workspaceId: string, projectId: string, auditType: import('@shared/types').AuditType = 'full'
): Promise<{ id: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('claim_audit_run', {
    ws_id: workspaceId,
    proj_id: projectId,
    audit_kind: auditType
  });
  if (error) {
    if (/AUDIT_IN_FLIGHT|P0014/.test(error.message)) {
      const existing = await fetchInFlightAudit(projectId);
      throw new AuditInFlightError(existing?.runByEmail ?? null, existing?.startedAt ?? null);
    }
    throw new Error(error.message);
  }
  return { id: (data as RunRow).id };
}

/**
 * Finalize a previously-claimed run with results + findings.
 */
export async function finalizeAuditRun(
  runId: string, run: AuditRun, project: { id: string; workspaceId?: string }
): Promise<void> {
  const supabase = getSupabase();
  let workspaceId = project.workspaceId;
  if (!workspaceId) {
    const { data: p } = await supabase.from('projects').select('workspace_id').eq('id', project.id).maybeSingle();
    workspaceId = (p as { workspace_id: string } | null)?.workspace_id;
    if (!workspaceId) throw new Error('Could not resolve workspace_id for project');
  }

  const { error: finalizeErr } = await supabase.rpc('finalize_audit_run', {
    run_id: runId,
    final_status: run.status,
    final_score: run.score,
    final_risk_level: run.riskLevel,
    final_summary: run.summary,
    final_recommended_next_action: run.recommendedNextAction,
    final_provider: run.provider,
    final_model: run.model,
    final_error_message: run.errorMessage
  });
  if (finalizeErr) throw new Error(finalizeErr.message);

  if (run.findings.length === 0) return;

  const findingRows = run.findings.map((f) => ({
    audit_run_id: runId,
    project_id: project.id,
    workspace_id: workspaceId,
    severity: f.severity,
    category: f.category,
    title: f.title,
    description: f.description,
    file_path: f.filePath,
    line_start: f.lineStart,
    line_end: f.lineEnd,
    recommendation: f.recommendation,
    suggested_prompt: f.suggestedPrompt,
    status: f.status
  }));
  for (let i = 0; i < findingRows.length; i += 100) {
    const chunk = findingRows.slice(i, i + 100);
    const { error: fErr } = await supabase.from('audit_findings').insert(chunk);
    if (fErr) throw new Error(fErr.message);
  }
}

/**
 * Backwards-compat wrapper: claim → run is already complete locally → finalize.
 * Used by the existing useStartAudit flow that fires audit then publishes.
 */
export async function publishAuditRun(run: AuditRun, project: { id: string; workspaceId?: string }): Promise<void> {
  if (!isCloud(project.id)) return;
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');

  let workspaceId = project.workspaceId;
  if (!workspaceId) {
    const { data: p } = await supabase.from('projects').select('workspace_id').eq('id', project.id).maybeSingle();
    workspaceId = (p as { workspace_id: string } | null)?.workspace_id;
    if (!workspaceId) throw new Error('Could not resolve workspace_id for project');
  }

  const { id: runId } = await claimAuditRun(workspaceId, project.id, run.auditType);
  await finalizeAuditRun(runId, run, { id: project.id, workspaceId });
}
