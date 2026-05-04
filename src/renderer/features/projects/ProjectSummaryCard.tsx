import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGenerateProjectSummary } from '@/features/settings/useSettings';
import type { ProjectAnalysisResult } from '@shared/ai';

interface Props {
  projectId: string;
}

export function ProjectSummaryCard({ projectId }: Props) {
  const gen = useGenerateProjectSummary();
  const [result, setResult] = useState<ProjectAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const r = await gen.mutateAsync(projectId);
      setResult(r);
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">AI Project Summary</CardTitle>
          <CardDescription>
            Runs the active AI provider on the latest scan summary. Source code is not sent. Secret-shaped tokens are redacted.
          </CardDescription>
        </div>
        <Button onClick={run} disabled={gen.isPending}>
          <Sparkles className="h-4 w-4" /> {gen.isPending ? 'Thinking…' : 'Generate Summary'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="text-sm text-destructive">{error}</div>}
        {result && (
          <>
            <p className="text-sm leading-relaxed">{result.summary}</p>
            {result.recommendedNextActions.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Recommended next actions</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {result.recommendedNextActions.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {result.risks.length > 0 && (
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Risks</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {result.risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{result.trace.providerId} · {result.trace.model}</Badge>
              <span>{result.trace.durationMs}ms</span>
              {result.trace.inputTokens !== null && <span>· in {result.trace.inputTokens}</span>}
              {result.trace.outputTokens !== null && <span>· out {result.trace.outputTokens}</span>}
              <span>· redactions {result.trace.redactionsApplied}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
