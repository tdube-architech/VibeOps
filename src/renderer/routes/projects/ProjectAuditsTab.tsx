import { useEffect, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuditScoreRing } from '@/features/projects/AuditScoreRing';
import { FindingsTable } from '@/features/projects/FindingsTable';
import { RecommendedPromptCard } from '@/features/projects/RecommendedPromptCard';
import { useAuditList, useLatestAudit, useStartAudit, usePrompts } from '@/features/projects/useAudits';
import type { Project, AuditRun, GeneratedPrompt } from '@shared/types';

export function ProjectAuditsTab({ project }: { project: Project }) {
  const start = useStartAudit();
  const { data: list = [] } = useAuditList(project.id);
  const { data: latest, refetch: refetchLatest } = useLatestAudit(project.id);
  const { data: prompts = [] } = usePrompts(project.id);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void refetchLatest(); }, [list.length, refetchLatest]);

  async function run() {
    setError(null);
    try { await start.mutateAsync({ id: project.id, localPath: project.localPath, name: project.name }); }
    catch (e) { setError((e as Error).message); }
  }

  const topPrompt: GeneratedPrompt | null =
    latest?.generatedPromptId
      ? prompts.find((p) => p.id === latest.generatedPromptId) ?? null
      : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Audits</CardTitle>
            <CardDescription>Read-only audit. No code is modified. AI completeness checks run if a provider is active.</CardDescription>
          </div>
          <Button onClick={run} disabled={start.isPending}>
            <Play className="h-4 w-4" /> {start.isPending ? 'Running…' : 'Run Audit'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="text-sm text-destructive">{error}</div>}
          {!latest && !start.isPending && (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No audit yet. A scan must exist first; then click "Run Audit".
            </div>
          )}
          {latest && (
            <div className="flex items-start gap-6">
              <AuditScoreRing score={latest.score ?? 0} risk={latest.riskLevel ?? 'Critical'} />
              <div className="flex-1 space-y-2">
                <div className="text-sm">{latest.summary}</div>
                {latest.recommendedNextAction && (
                  <div className="text-sm">
                    <span className="font-medium">Recommended next action:</span> {latest.recommendedNextAction}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {latest.provider && <Badge variant="outline"><Sparkles className="h-3 w-3" /> {latest.provider} · {latest.model}</Badge>}
                  <span>Started {new Date(latest.startedAt).toLocaleString()}</span>
                  {latest.completedAt && <span>· {((new Date(latest.completedAt).getTime() - new Date(latest.startedAt).getTime()) / 1000).toFixed(1)}s</span>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {latest && <RecommendedPromptCard prompt={topPrompt} />}
      {latest && (
        <Card>
          <CardHeader><CardTitle className="text-base">Findings</CardTitle></CardHeader>
          <CardContent><FindingsTable findings={latest.findings} /></CardContent>
        </Card>
      )}

      {list.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {list.slice(0, 10).map((r: AuditRun) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <div className="font-medium">{r.completedAt ? new Date(r.completedAt).toLocaleString() : 'in progress'}</div>
                    <div className="text-xs text-muted-foreground">
                      score {r.score ?? '—'} · {r.findings.length} findings · {r.riskLevel ?? '—'}
                    </div>
                  </div>
                  <Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
