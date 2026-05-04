import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Upload, Trash2, RotateCcw } from 'lucide-react';
import { useExportDb, useImportDb, useClearAuditHistory, useResetApp } from './useData';
import { toast } from '@/lib/toast';

export function DataManagementCard() {
  const exp = useExportDb();
  const imp = useImportDb();
  const clearAudit = useClearAuditHistory();
  const reset = useResetApp();

  async function onExport() {
    try { const r = await exp.mutateAsync(); toast.success('Database exported', `${r.bytesCopied} bytes → ${r.destination}`); }
    catch (e) { toast.error('Export failed', (e as Error).message); }
  }
  async function onImport() {
    if (!window.confirm('Import will replace the current database. A timestamped backup will be created. Continue?')) return;
    try { await imp.mutateAsync(); toast.info('Database imported', 'Restart the app to load it.'); }
    catch (e) { toast.error('Import failed', (e as Error).message); }
  }
  async function onClearAudits() {
    if (!window.confirm('Delete ALL audit runs and findings? Projects and scans are preserved. This cannot be undone.')) return;
    try { await clearAudit.mutateAsync(); toast.success('Audit history cleared'); }
    catch (e) { toast.error('Clear failed', (e as Error).message); }
  }
  async function onReset() {
    if (!window.confirm('This will delete all VibeOps data: projects, scans, memories, audits, settings, and API keys. This cannot be undone. Continue?')) return;
    try { await reset.mutateAsync(); }
    catch (e) { toast.error('Reset failed', (e as Error).message); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Management</CardTitle>
        <CardDescription>Local-only operations on the SQLite database.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={onExport}><Download className="h-4 w-4" /> Export Database</Button>
        <Button variant="outline" onClick={onImport}><Upload className="h-4 w-4" /> Import Database</Button>
        <Button variant="outline" onClick={onClearAudits}><Trash2 className="h-4 w-4" /> Clear Audit History</Button>
        <Button variant="destructive" onClick={onReset}><RotateCcw className="h-4 w-4" /> Reset App</Button>
      </CardContent>
    </Card>
  );
}
