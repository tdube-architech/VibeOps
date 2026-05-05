import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMigrationStatus } from './useMigrate';
import { MigrationDialog } from './MigrationDialog';

export function MigrationCard() {
  const { unmigrated, loading } = useMigrationStatus();
  const [open, setOpen] = useState(false);
  const count = unmigrated?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Project Migration</CardTitle>
        <CardDescription>
          {loading
            ? 'Scanning local projects…'
            : count === 0
              ? 'All local projects have been uploaded.'
              : `${count} local project${count === 1 ? '' : 's'} not yet uploaded.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" disabled={count === 0 || loading} onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4" /> Open migration dialog
        </Button>
      </CardContent>
      <MigrationDialog open={open} onOpenChange={setOpen} />
    </Card>
  );
}
