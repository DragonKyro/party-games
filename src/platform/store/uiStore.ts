import { create } from 'zustand';

export interface Toast {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'error';
}

interface UiState {
  toasts: Toast[];
  pushToast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  pushToast: (text, kind = 'info') => {
    const id = `t${++toastCounter}`;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
