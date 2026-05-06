import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

const STORAGE_KEY = 'vibeops:terminals';

export interface PersistedCell {
  id: string;
  /** Local terminal session id from main process (term_*). Null until the user clicks Start. */
  localTerminalId: string | null;
  /** AI session id (Supabase row uuid). Null for non-cloud projects or pre-start. */
  aiSessionId: string | null;
  sessionStartSha: string | null;
  /** True while a pop-out window holds this cell's display. */
  poppedOut?: boolean;
}

export interface PersistedState {
  /** Cells keyed by projectId. Each cell renders one TerminalView. */
  cellsByProject: Record<string, PersistedCell[]>;
}

const DEFAULT: PersistedState = { cellsByProject: {} };

let state: PersistedState = load();
const listeners = new Set<(s: PersistedState) => void>();
let cellCounter = 0;

function load(): PersistedState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as PersistedState;
    return { cellsByProject: parsed.cellsByProject ?? {} };
  } catch {
    return { ...DEFAULT };
  }
}

function persist(): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch { /* quota / private mode — ignore */ }
}

function notify(): void {
  for (const l of listeners) {
    try { l(state); } catch { /* ignore */ }
  }
}

function set(patch: (prev: PersistedState) => PersistedState): void {
  state = patch(state);
  persist();
  notify();
}

export function newCellId(): string {
  cellCounter += 1;
  return `cell_${Date.now()}_${cellCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getCells(projectId: string): PersistedCell[] {
  return state.cellsByProject[projectId] ?? [];
}

export function setCells(projectId: string, cells: PersistedCell[]): void {
  set((prev) => ({
    ...prev,
    cellsByProject: { ...prev.cellsByProject, [projectId]: cells }
  }));
}

export function ensureProjectInitialized(projectId: string): void {
  if (state.cellsByProject[projectId]) return;
  setCells(projectId, [{ id: newCellId(), localTerminalId: null, aiSessionId: null, sessionStartSha: null }]);
}

export function addCell(projectId: string): void {
  const current = getCells(projectId);
  if (current.length >= 16) return;
  setCells(projectId, [...current, { id: newCellId(), localTerminalId: null, aiSessionId: null, sessionStartSha: null }]);
}

export function removeCell(projectId: string, cellId: string): void {
  const current = getCells(projectId);
  const cell = current.find((c) => c.id === cellId);
  if (cell?.localTerminalId) {
    void api.terminal.kill(cell.localTerminalId).catch(() => {});
    void api.aiSession.stopWatch(cell.localTerminalId).catch(() => {});
  }
  setCells(projectId, current.filter((c) => c.id !== cellId));
}

export function setTargetCount(projectId: string, target: number): void {
  const current = getCells(projectId);
  if (current.length === target) return;
  if (current.length < target) {
    const add = Array.from(
      { length: target - current.length },
      () => ({ id: newCellId(), localTerminalId: null, aiSessionId: null, sessionStartSha: null })
    );
    setCells(projectId, [...current, ...add]);
    return;
  }
  // Shrink: kill trimmed cells.
  const keep = current.slice(0, target);
  const drop = current.slice(target);
  for (const c of drop) {
    if (c.localTerminalId) {
      void api.terminal.kill(c.localTerminalId).catch(() => {});
      void api.aiSession.stopWatch(c.localTerminalId).catch(() => {});
    }
  }
  setCells(projectId, keep);
}

export function updateCellSession(
  projectId: string,
  cellId: string,
  patch: Partial<Pick<PersistedCell, 'localTerminalId' | 'aiSessionId' | 'sessionStartSha' | 'poppedOut'>>
): void {
  const current = getCells(projectId);
  setCells(projectId, current.map((c) => (c.id === cellId ? { ...c, ...patch } : c)));
}

/**
 * Verifies persisted local terminal ids are still alive in the main process.
 * Stale references get cleared so the cell falls back to "needs Start".
 */
export async function reconcileLiveSessions(): Promise<void> {
  let live: Set<string>;
  try {
    const sessions = await api.terminal.list();
    live = new Set(sessions.filter((s) => !s.endedAt).map((s) => s.id));
  } catch {
    return; // best effort — leave persisted state alone
  }
  let mutated = false;
  const next: Record<string, PersistedCell[]> = {};
  for (const [projectId, cells] of Object.entries(state.cellsByProject)) {
    next[projectId] = cells.map((c) => {
      if (c.localTerminalId && !live.has(c.localTerminalId)) {
        mutated = true;
        return { ...c, localTerminalId: null, aiSessionId: null, sessionStartSha: null, poppedOut: false };
      }
      return c;
    });
  }
  if (mutated) {
    state = { cellsByProject: next };
    persist();
    notify();
  }
}

export function useCells(projectId: string | null): PersistedCell[] {
  const [cells, setLocal] = useState<PersistedCell[]>(() => projectId ? getCells(projectId) : []);
  useEffect(() => {
    if (!projectId) { setLocal([]); return; }
    setLocal(getCells(projectId));
    const cb = (s: PersistedState): void => {
      setLocal(s.cellsByProject[projectId] ?? []);
    };
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, [projectId]);
  return cells;
}
