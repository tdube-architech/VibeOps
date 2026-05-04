import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUpdatePrompt } from './useAudits';
import type { GeneratedPrompt } from '@shared/types';

export function RecommendedPromptCard({ prompt }: { prompt: GeneratedPrompt | null }) {
  const update = useUpdatePrompt();
  const [copied, setCopied] = useState(false);

  if (!prompt) return null;

  async function copy() {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
    if (prompt.status === 'unused') {
      update.mutate({ id: prompt.id, patch: { status: 'used', usedAt: new Date().toISOString() } });
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Recommended Prompt</CardTitle>
          <CardDescription>{prompt.title} · {prompt.promptType} · {prompt.status}</CardDescription>
        </div>
        <Button onClick={copy} variant="outline" size="sm">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap rounded-md border border-border bg-card/40 p-4 text-xs leading-relaxed font-mono">
{prompt.content}
        </pre>
      </CardContent>
    </Card>
  );
}
