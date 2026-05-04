import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ScanFile } from '@shared/types';

interface Node {
  name: string;
  fullPath: string;
  isDir: boolean;
  importance: number;
  fileType?: ScanFile['fileType'];
  children: Map<string, Node>;
}

function buildTree(files: ScanFile[]): Node {
  const root: Node = { name: '', fullPath: '', isDir: true, importance: 0, children: new Map() };
  for (const f of files) {
    const parts = f.path.split('/');
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]!;
      const fullPath = parts.slice(0, i + 1).join('/');
      const isLeaf = i === parts.length - 1;
      let next = cursor.children.get(name);
      if (!next) {
        next = isLeaf
          ? { name, fullPath, isDir: false, importance: 0, fileType: f.fileType, children: new Map() }
          : { name, fullPath, isDir: true, importance: 0, children: new Map() };
        cursor.children.set(name, next);
      }
      next.importance = Math.max(next.importance, f.importanceScore);
      cursor = next;
    }
  }
  return root;
}

function NodeView({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(depth < 1 || node.importance >= 80);
  if (!node.isDir) {
    return (
      <div className="flex items-center gap-1 py-0.5 text-xs" style={{ paddingLeft: depth * 14 }}>
        <File className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono">{node.name}</span>
        {node.importance >= 80 && <Badge variant="outline" className="ml-2 text-[10px]">important</Badge>}
      </div>
    );
  }
  const children = Array.from(node.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return b.importance - a.importance || a.name.localeCompare(b.name);
  });
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 py-0.5 text-xs hover:text-foreground text-muted-foreground"
        style={{ paddingLeft: depth * 14 }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Folder className="h-3 w-3" />
        <span className="font-mono">{node.name || '/'}</span>
        <span className="ml-1 text-[10px]">{node.children.size}</span>
      </button>
      {open && children.map((c) => <NodeView key={c.fullPath} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function CodeMapTree({ files }: { files: ScanFile[] }) {
  const root = useMemo(() => buildTree(files), [files]);
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      {Array.from(root.children.values()).map((c) => <NodeView key={c.fullPath} node={c} depth={0} />)}
    </div>
  );
}
