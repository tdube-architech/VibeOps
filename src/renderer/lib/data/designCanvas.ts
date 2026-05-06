import { useCallback, useEffect, useId, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface DesignCanvas {
  id: string;
  projectId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CanvasRow {
  id: string;
  project_id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function rowToCanvas(r: CanvasRow): DesignCanvas {
  return {
    id: r.id,
    projectId: r.project_id,
    workspaceId: r.workspace_id,
    name: r.name,
    description: r.description,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export interface CanvasNode {
  id: string;
  canvasId: string;
  nodeType: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  data: Record<string, unknown>;
  updatedAt: string;
}

interface NodeRow {
  id: string;
  canvas_id: string;
  node_type: string;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  data: Record<string, unknown>;
  updated_at: string;
}

function rowToNode(r: NodeRow): CanvasNode {
  return {
    id: r.id,
    canvasId: r.canvas_id,
    nodeType: r.node_type,
    positionX: r.position_x,
    positionY: r.position_y,
    width: r.width,
    height: r.height,
    data: r.data ?? {},
    updatedAt: r.updated_at
  };
}

export interface CanvasEdge {
  id: string;
  canvasId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string | null;
  data: Record<string, unknown>;
}

interface EdgeRow {
  id: string;
  canvas_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
  data: Record<string, unknown>;
}

function rowToEdge(r: EdgeRow): CanvasEdge {
  return {
    id: r.id,
    canvasId: r.canvas_id,
    sourceNodeId: r.source_node_id,
    targetNodeId: r.target_node_id,
    sourceHandle: r.source_handle,
    targetHandle: r.target_handle,
    label: r.label,
    data: r.data ?? {}
  };
}

export async function listCanvases(projectId: string): Promise<DesignCanvas[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('project_canvases')
    .select('*')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as CanvasRow[]).map(rowToCanvas);
}

export async function createCanvas(args: {
  projectId: string;
  workspaceId: string;
  name: string;
  description?: string;
}): Promise<DesignCanvas> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('project_canvases')
    .insert({
      project_id: args.projectId,
      workspace_id: args.workspaceId,
      name: args.name,
      description: args.description ?? null,
      created_by: u.user?.id ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToCanvas(data as CanvasRow);
}

export async function renameCanvas(canvasId: string, name: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('project_canvases')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', canvasId);
  if (error) throw new Error(error.message);
}

export async function deleteCanvas(canvasId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('project_canvases').delete().eq('id', canvasId);
  if (error) throw new Error(error.message);
}

export async function listNodes(canvasId: string): Promise<CanvasNode[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('canvas_nodes')
    .select('*')
    .eq('canvas_id', canvasId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as NodeRow[]).map(rowToNode);
}

export async function listEdges(canvasId: string): Promise<CanvasEdge[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('canvas_edges')
    .select('*')
    .eq('canvas_id', canvasId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as EdgeRow[]).map(rowToEdge);
}

export async function upsertNode(args: {
  id?: string;
  canvasId: string;
  nodeType: string;
  positionX: number;
  positionY: number;
  width?: number | null;
  height?: number | null;
  data?: Record<string, unknown>;
}): Promise<CanvasNode> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  const update: Record<string, unknown> = {
    canvas_id: args.canvasId,
    node_type: args.nodeType,
    position_x: args.positionX,
    position_y: args.positionY,
    width: args.width ?? null,
    height: args.height ?? null,
    data: args.data ?? {},
    updated_by: u.user?.id ?? null,
    updated_at: new Date().toISOString()
  };
  if (args.id) update.id = args.id;
  const { data, error } = await supabase
    .from('canvas_nodes')
    .upsert(update, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToNode(data as NodeRow);
}

export async function deleteNode(nodeId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('canvas_nodes').delete().eq('id', nodeId);
  if (error) throw new Error(error.message);
}

export async function createEdge(args: {
  canvasId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string | null;
}): Promise<CanvasEdge> {
  const supabase = getSupabase();
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('canvas_edges')
    .insert({
      canvas_id: args.canvasId,
      source_node_id: args.sourceNodeId,
      target_node_id: args.targetNodeId,
      source_handle: args.sourceHandle ?? null,
      target_handle: args.targetHandle ?? null,
      label: args.label ?? null,
      created_by: u.user?.id ?? null
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return rowToEdge(data as EdgeRow);
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('canvas_edges').delete().eq('id', edgeId);
  if (error) throw new Error(error.message);
}

export function useCanvasRealtime(
  canvasId: string | null | undefined,
  onChange: () => void
): void {
  const consumerId = useId();
  useEffect(() => {
    if (!canvasId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`design-canvas-${canvasId}-${consumerId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_nodes', filter: `canvas_id=eq.${canvasId}` },
        () => onChange())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_edges', filter: `canvas_id=eq.${canvasId}` },
        () => onChange())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canvasId, onChange, consumerId]);
}

export function useCanvasNodes(canvasId: string | null | undefined): CanvasNode[] {
  const [list, setList] = useState<CanvasNode[]>([]);
  const refresh = useCallback(() => {
    if (!canvasId) { setList([]); return; }
    void listNodes(canvasId).then(setList).catch(() => {});
  }, [canvasId]);
  useEffect(() => { refresh(); }, [refresh]);
  useCanvasRealtime(canvasId, refresh);
  return list;
}

export function useCanvasEdges(canvasId: string | null | undefined): CanvasEdge[] {
  const [list, setList] = useState<CanvasEdge[]>([]);
  const refresh = useCallback(() => {
    if (!canvasId) { setList([]); return; }
    void listEdges(canvasId).then(setList).catch(() => {});
  }, [canvasId]);
  useEffect(() => { refresh(); }, [refresh]);
  useCanvasRealtime(canvasId, refresh);
  return list;
}
