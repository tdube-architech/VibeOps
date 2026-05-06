import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  ReactFlowProvider, useNodesState, useEdgesState,
  addEdge as rfAddEdge,
  type Node, type Edge, type Connection, type NodeChange,
  type EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, Plus, Trash2, MousePointer2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useCanvasNodes, useCanvasEdges,
  upsertNode, deleteNode, createEdge, deleteEdge,
  type CanvasNode as DbNode, type CanvasEdge as DbEdge
} from '@/lib/data/designCanvas';
import {
  TECH_LIBRARY, CATEGORY_META, BLANK_BY_CATEGORY,
  type TechCategory, type TechEntry
} from './techLibrary';
import { TechBlockNode, type TechBlockData } from './TechBlockNode';
import { IconPickerDialog } from './IconPickerDialog';

interface Props {
  canvasId: string;
}

export function DesignCanvas({ canvasId }: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner canvasId={canvasId} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ canvasId }: Props) {
  const dbNodes = useCanvasNodes(canvasId);
  const dbEdges = useCanvasEdges(canvasId);

  const [nodes, setNodes, onNodesChangeBase] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const draggingRef = useRef<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<TechCategory | null>(null);
  const [iconPicker, setIconPicker] = useState<{ open: boolean; targetId: string | null }>(
    { open: false, targetId: null }
  );
  const [selection, setSelection] = useState<{ nodeIds: string[]; edgeIds: string[] }>(
    { nodeIds: [], edgeIds: [] }
  );

  const filteredTech = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return TECH_LIBRARY.filter((t) => {
      if (activeCategory && t.category !== activeCategory) return false;
      if (!needle) return true;
      return t.label.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle);
    });
  }, [search, activeCategory]);

  // ----- DB <-> RF sync ----------------------------------------------------

  const handleLabelChange = useCallback((id: string, label: string) => {
    const dbNode = dbNodes.find((n) => n.id === id);
    if (!dbNode) return;
    void upsertNode({
      id,
      canvasId,
      nodeType: dbNode.nodeType,
      positionX: dbNode.positionX,
      positionY: dbNode.positionY,
      data: { ...dbNode.data, label }
    });
  }, [dbNodes, canvasId]);

  const handleOpenIconPicker = useCallback((id: string) => {
    setIconPicker({ open: true, targetId: id });
  }, []);

  const handlePickIcon = useCallback((entry: TechEntry) => {
    const id = iconPicker.targetId;
    if (!id) return;
    const dbNode = dbNodes.find((n) => n.id === id);
    if (!dbNode) return;
    void upsertNode({
      id,
      canvasId,
      nodeType: entry.id,
      positionX: dbNode.positionX,
      positionY: dbNode.positionY,
      data: {
        label: (dbNode.data?.['label'] as string) ?? entry.label,
        iconSlug: entry.iconSlug,
        iconColor: entry.color,
        category: entry.category
      }
    });
  }, [iconPicker.targetId, dbNodes, canvasId]);

  const nodeTypes = useMemo(() => ({
    techblock: (props: import('@xyflow/react').NodeProps) => (
      <TechBlockNode
        {...props}
        data={props.data as TechBlockData}
        onLabelChange={handleLabelChange}
        onOpenIconPicker={handleOpenIconPicker}
      />
    )
  }), [handleLabelChange, handleOpenIconPicker]);

  useEffect(() => {
    setNodes((current) => {
      const dragging = draggingRef.current;
      return dbNodes.map((n) => {
        const existing = current.find((c) => c.id === n.id);
        if (existing && dragging.has(n.id)) return existing;
        return dbNodeToRf(n);
      });
    });
  }, [dbNodes, setNodes]);

  useEffect(() => {
    setEdges(dbEdges.map(dbEdgeToRf));
  }, [dbEdges, setEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChangeBase(changes);
    for (const ch of changes) {
      if (ch.type === 'position') {
        if (ch.dragging) {
          draggingRef.current.add(ch.id);
        } else {
          draggingRef.current.delete(ch.id);
          if (ch.position) {
            const dbNode = dbNodes.find((n) => n.id === ch.id);
            if (dbNode) {
              void upsertNode({
                id: ch.id,
                canvasId,
                nodeType: dbNode.nodeType,
                positionX: ch.position.x,
                positionY: ch.position.y,
                data: dbNode.data
              });
            }
          }
        }
      } else if (ch.type === 'remove') {
        void deleteNode(ch.id);
      }
    }
  }, [onNodesChangeBase, dbNodes, canvasId]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    onEdgesChangeBase(changes);
    for (const ch of changes) {
      if (ch.type === 'remove') void deleteEdge(ch.id);
    }
  }, [onEdgesChangeBase]);

  const onSelectionChange = useCallback(
    (params: { nodes: Node[]; edges: Edge[] }) => {
      setSelection({
        nodeIds: params.nodes.map((n) => n.id),
        edgeIds: params.edges.map((e) => e.id)
      });
    },
    []
  );

  const deleteSelected = useCallback(async () => {
    const { nodeIds, edgeIds } = selection;
    if (nodeIds.length === 0 && edgeIds.length === 0) return;
    // Optimistic UI: drop from local React Flow state immediately.
    setNodes((cur) => cur.filter((n) => !nodeIds.includes(n.id)));
    setEdges((cur) => cur.filter((e) => !edgeIds.includes(e.id)));
    setSelection({ nodeIds: [], edgeIds: [] });
    // Persist deletes in parallel.
    await Promise.all([
      ...edgeIds.map((id) => deleteEdge(id).catch(() => {})),
      ...nodeIds.map((id) => deleteNode(id).catch(() => {}))
    ]);
  }, [selection, setNodes, setEdges]);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    setEdges((eds) => rfAddEdge(conn, eds));
    void createEdge({
      canvasId,
      sourceNodeId: conn.source,
      targetNodeId: conn.target,
      sourceHandle: conn.sourceHandle ?? null,
      targetHandle: conn.targetHandle ?? null
    });
  }, [canvasId, setEdges]);

  // ----- Add helpers --------------------------------------------------------

  async function addTech(entry: TechEntry): Promise<void> {
    await upsertNode({
      canvasId,
      nodeType: entry.id,
      positionX: 80 + Math.random() * 200,
      positionY: 80 + Math.random() * 200,
      data: {
        label: entry.label,
        iconSlug: entry.iconSlug,
        iconColor: entry.color,
        category: entry.category
      }
    });
  }

  async function addBlank(category: TechCategory): Promise<void> {
    const blank = BLANK_BY_CATEGORY[category];
    await upsertNode({
      canvasId,
      nodeType: blank.id,
      positionX: 80 + Math.random() * 200,
      positionY: 80 + Math.random() * 200,
      data: {
        label: blank.label,
        iconSlug: null,
        iconColor: blank.color,
        category
      }
    });
  }

  return (
    <div className="flex h-[640px] gap-3">
      <div className="flex w-72 flex-col gap-2 rounded-md border border-border p-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> Tech library
        </div>
        <Input
          placeholder="Search react, postgres…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-xs"
        />

        <div className="flex flex-wrap gap-1">
          <button
            className={`rounded-md border px-2 py-0.5 text-[10px] uppercase ${
              activeCategory === null
                ? 'border-foreground bg-foreground/10'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveCategory(null)}
          >
            All
          </button>
          {(Object.keys(CATEGORY_META) as TechCategory[]).map((c) => (
            <button
              key={c}
              className={`rounded-md border px-2 py-0.5 text-[10px] uppercase ${
                activeCategory === c
                  ? 'border-foreground bg-foreground/10'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveCategory(c)}
            >
              {CATEGORY_META[c].label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-1 overflow-auto pr-1">
          {filteredTech.map((t) => (
            <button
              key={t.id}
              onClick={() => void addTech(t)}
              className="flex w-full items-center gap-2 rounded-md border border-border bg-background/40 px-2 py-1 text-left text-xs hover:border-foreground"
              title={`Add ${t.label} to canvas`}
            >
              {t.iconSlug ? (
                <img
                  src={`https://cdn.simpleicons.org/${t.iconSlug}/${t.color}`}
                  alt=""
                  className="h-4 w-4 shrink-0"
                  draggable={false}
                  onError={(e) => {
                    const img = e.currentTarget;
                    const fallback = document.createElement('div');
                    fallback.className = 'h-4 w-4 shrink-0 rounded';
                    fallback.style.background = `#${t.color}`;
                    img.replaceWith(fallback);
                  }}
                />
              ) : (
                <div
                  className="h-4 w-4 shrink-0 rounded"
                  style={{ background: `#${t.color}` }}
                />
              )}
              <span className="flex-1 truncate font-medium">{t.label}</span>
              <span className="text-[9px] uppercase text-muted-foreground">
                {CATEGORY_META[t.category].label}
              </span>
            </button>
          ))}
          {filteredTech.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">
              No matches. Use a blank block below.
            </div>
          )}
        </div>

        <div className="border-t border-border pt-2">
          <div className="mb-1 text-[10px] uppercase text-muted-foreground">Blank blocks</div>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CATEGORY_META) as TechCategory[]).map((c) => (
              <Button
                key={c}
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={() => void addBlank(c)}
              >
                <Plus className="h-3 w-3" /> {CATEGORY_META[c].label}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Double-click any block to rename. Click its icon to swap.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MousePointer2 className="h-3.5 w-3.5" />
          <span>
            Click a block to select. Shift-click to add to selection. Drag empty canvas to pan.
          </span>
          <div className="ml-auto flex items-center gap-2">
            {(selection.nodeIds.length + selection.edgeIds.length) > 0 && (
              <span className="text-foreground">
                {selection.nodeIds.length} block{selection.nodeIds.length === 1 ? '' : 's'}
                {selection.edgeIds.length > 0 && (
                  <>, {selection.edgeIds.length} connection{selection.edgeIds.length === 1 ? '' : 's'}</>
                )}{' '}
                selected
              </span>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => void deleteSelected()}
              disabled={selection.nodeIds.length + selection.edgeIds.length === 0}
              title="Delete selected (Del / Backspace)"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden rounded-md border border-border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            nodeTypes={nodeTypes}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            deleteKeyCode={['Delete', 'Backspace']}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>
      </div>

      <IconPickerDialog
        open={iconPicker.open}
        onOpenChange={(v) => setIconPicker({ open: v, targetId: v ? iconPicker.targetId : null })}
        onPick={handlePickIcon}
      />
    </div>
  );
}

function dbNodeToRf(n: DbNode): Node {
  return {
    id: n.id,
    type: 'techblock',
    position: { x: n.positionX, y: n.positionY },
    data: {
      label: n.data?.['label'],
      iconSlug: n.data?.['iconSlug'] ?? null,
      iconColor: n.data?.['iconColor'] ?? null,
      category: n.data?.['category'] ?? inferCategoryFromType(n.nodeType)
    }
  } as Node;
}

function dbEdgeToRf(e: DbEdge): Edge {
  const edge: Edge = {
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    label: e.label ?? undefined,
    animated: true
  };
  if (e.sourceHandle) edge.sourceHandle = e.sourceHandle;
  if (e.targetHandle) edge.targetHandle = e.targetHandle;
  return edge;
}

function inferCategoryFromType(t: string): TechCategory {
  const entry = TECH_LIBRARY.find((x) => x.id === t);
  if (entry) return entry.category;
  if (['frontend', 'service', 'database', 'queue', 'external', 'note'].includes(t)) {
    return t as TechCategory;
  }
  return 'service';
}
