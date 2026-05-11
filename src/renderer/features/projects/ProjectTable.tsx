import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Cloud, HardDrive, Upload } from 'lucide-react';
import { ProjectStatusBadge } from './ProjectStatusBadge';
import { useMigrateOne } from '@/features/migrate/useMigrate';
import { relativeTime } from '@/lib/relative-time';
import { toast } from '@/lib/toast';
import { useProjectList } from './useProjects';
import { useSelectedProjectId, useSetSelectedProject } from './selectedProject';
import { cn } from '@/lib/utils';
import type { Project } from '@shared/types';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

const columns: ColumnDef<Project>[] = [
  {
    header: 'Project',
    accessorKey: 'name',
    cell: ({ row }) => (
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.source === 'local' ? (
            <Badge variant="warning" className="gap-1">
              <HardDrive className="h-3 w-3" /> Local only
            </Badge>
          ) : (
            <Badge variant="success" className="gap-1">
              <Cloud className="h-3 w-3" /> Cloud
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate max-w-[28rem]">{row.original.localPath}</div>
      </div>
    )
  },
  {
    header: 'Stack',
    accessorKey: 'primaryStack',
    cell: ({ row }) => row.original.primaryStack ?? <span className="text-muted-foreground">—</span>
  },
  {
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />
  },
  { header: 'Last Scan', accessorKey: 'lastScannedAt', cell: ({ row }) => {
      const v = row.original.lastScannedAt;
      return v ? <span title={v}>{relativeTime(v)}</span> : '—';
    } },
  { header: 'Last Audit', accessorKey: 'lastAuditedAt', cell: ({ row }) => {
      const v = row.original.lastAuditedAt;
      return v ? <span title={v}>{relativeTime(v)}</span> : '—';
    } }
];

interface Props {
  includeArchived?: boolean;
}

export function ProjectTable({ includeArchived = false }: Props) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const setSelected = useSetSelectedProject();
  const selectedId = useSelectedProjectId();
  const migrateOne = useMigrateOne();
  const { data: projects = [], isLoading } = useProjectList({
    ...(search ? { search } : {}),
    includeArchived
  });

  async function onMigrate(p: Project) {
    const res = await migrateOne(p);
    if (res.ok) toast.success(`Migrated ${p.name}`, 'Now visible to workspace members.');
    else toast.error(`Migration failed`, res.message);
  }

  const data = useMemo(() => projects, [projects]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by name or path"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium text-xs uppercase tracking-wide">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">No projects yet.</td></tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-t border-border hover:bg-secondary/40 cursor-pointer',
                    row.original.id === selectedId && 'bg-secondary/60'
                  )}
                  onClick={() => setSelected(row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                    {row.original.source === 'local' && (
                      <Button variant="outline" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        void onMigrate(row.original);
                      }}>
                        <Upload className="h-3 w-3" /> Migrate
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/projects/${row.original.id}`);
                    }}>Open</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
