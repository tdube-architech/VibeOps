import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CodeMapTree } from '@/features/projects/CodeMapTree';
import { useScanFiles, useLatestScan } from '@/features/projects/useScans';
import { EmptyState } from '@/components/EmptyState';
import { FolderTree } from 'lucide-react';
import type { Project } from '@shared/types';

export function ProjectCodeMapTab({ project }: { project: Project }) {
  const { data: latest } = useLatestScan(project.id);
  const { data: files = [] } = useScanFiles(latest?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code Map</CardTitle>
        <CardDescription>Directory tree from the latest scan. Important files (importance ≥ 80) are flagged.</CardDescription>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <EmptyState icon={<FolderTree className="h-6 w-6" />} title="No scan files yet" description="Run a scan first." />
        ) : (
          <CodeMapTree files={files} />
        )}
      </CardContent>
    </Card>
  );
}
