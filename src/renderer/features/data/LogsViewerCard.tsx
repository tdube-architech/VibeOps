import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLogs } from './useData';

export function LogsViewerCard() {
  const { data: lines = [], refetch, isFetching } = useLogs(200);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle>App Logs</CardTitle>
          <CardDescription>Last 200 lines from %APPDATA%\VibeOps\logs\app.log</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Refreshing…' : 'Refresh'}</Button>
      </CardHeader>
      <CardContent>
        <pre className="max-h-[300px] overflow-auto rounded-md border border-border bg-card/40 p-3 text-[10px] font-mono leading-relaxed">
{lines.join('\n') || '(no log file yet)'}
        </pre>
      </CardContent>
    </Card>
  );
}
