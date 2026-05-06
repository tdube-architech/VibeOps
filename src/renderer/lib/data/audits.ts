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

/**
 * Push a freshly-completed local audit run + findings to Supabase so other
 * workspace members see it. Caller passes the AuditRun returned by main process.
 */
export async function publishAuditRun(run: AuditRun, project: { id: string; workspaceId?: string }): Promise<void> {
  if (!isCloud(project.id)) return;
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in');

  // Need workspace_id on the server side. Look it up if not provided.
  let workspaceId = project.workspaceId;
  if (!workspaceId) {
    const { data: p } = await supabase.from('projects').select('workspace_id').eq('id', project.id).maybeSingle();
    workspaceId = (p as { workspace_id: string } | null)?.workspace_id;
    if (!workspaceId) throw new Error('Could not resolve workspace_id for project');
  }

  // Insert run
  const { data: insertedRun, error: runErr } = await supabase
    .from('audit_runs')
    .insert({
      project_id: project.id,
      workspace_id: workspaceId,
      audit_type: run.auditType,
      status: run.status,
      score: run.score,
      risk_level: run.riskLevel,
      summary: run.summary,
      recommended_next_action: run.recommendedNextAction,
      provider: run.provider,
      model: run.model,
      run_by_user_id: u.user.id,
      started_at: run.startedAt,
      completed_at: run.completedAt,
      error_message: run.errorMessage
    })
    .select('id')
    .single();
  if (runErr) throw new Error(runErr.message);
  const newRunId = (insertedRun as { id: string }).id;

  if (run.findings.length === 0) return;

  const findingRows = run.findings.map((f) => ({
    audit_run_id: newRunId,
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

  // Bulk insert in chunks of 100
  for (let i = 0; i < findingRows.length; i += 100) {
    const chunk = findingRows.slice(i, i + 100);
    const { error: fErr } = await supabase.from('audit_findings').insert(chunk);
    if (fErr) throw new Error(fErr.message);
  }
}
