import { create } from 'zustand';

interface State {
  selectedId: string | null;
  setSelected: (id: string | null) => void;
}

const useStore = create<State>((set) => ({
  selectedId: null,
  setSelected: (id) => set({ selectedId: id })
}));

export function useSelectedProjectId(): string | null { return useStore((s) => s.selectedId); }
export function useSetSelectedProject(): (id: string | null) => void { return useStore((s) => s.setSelected); }
