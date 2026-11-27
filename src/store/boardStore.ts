import { create } from 'zustand';
import { BoardModel, MAX_OPS_PER_BATCH, parseBatch, type BoardOp } from '@/draw/board';

// ============================================================================
// Live board store (Sketch & Guess)
// ============================================================================
//
// Holds the board being drawn right now. The drawer's canvas calls `draw`
// (applied locally at once, and queued for the network in small batches);
// everyone else's ops arrive through the room's board channel (`receive`).
// Op ids make both paths idempotent, so a drawer's own echoed ops and a
// reconnect's replay are harmless.
//
// On a single-device table there's no sender: the model is local only.

const FLUSH_MS = 90;
const RETRY_MS = 600;
const MAX_RETRIES = 4;

interface BoardStore {
  boardId: string | null;
  /** Bumped on every change, so canvases know to repaint. */
  version: number;
  model: BoardModel;
  /** Network: push a batch for `boardId`. null offline. Registered by networkStore. */
  sender: ((boardId: string, payload: string) => Promise<void>) | null;
  setSender: (fn: BoardStore['sender']) => void;
  /** Switch to board `id` (a new turn wipes it). Same id = no-op. */
  reset: (id: string | null) => void;
  /** Ops from the network. Ignored unless for the current board. */
  receive: (boardId: string, payload: string) => void;
  /** Local drawing. */
  draw: (op: BoardOp) => void;
  /** A fresh op id unique to this device. */
  nextOpId: () => string;
}

const deviceTag = Math.random().toString(36).slice(2, 7);
let seq = 0;
let pending: BoardOp[] = [];
let pendingBoard: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useBoardStore = create<BoardStore>((set, get) => {
  function flush(retries = 0) {
    flushTimer = null;
    const { sender, boardId } = get();
    if (!sender || !boardId || pendingBoard !== boardId || pending.length === 0) {
      pending = [];
      return;
    }
    while (pending.length > 0) {
      const batch = pending.splice(0, MAX_OPS_PER_BATCH);
      const id = boardId;
      sender(id, JSON.stringify(batch)).catch((e: Error) => {
        // Usually the host hasn't granted us the board yet: retry a few times.
        if (retries >= MAX_RETRIES || get().boardId !== id) {
          console.warn('[board] ops dropped:', e.message);
          return;
        }
        pending = [...batch, ...pending];
        pendingBoard = id;
        if (!flushTimer) flushTimer = setTimeout(() => flush(retries + 1), RETRY_MS);
      });
    }
  }

  return {
    boardId: null,
    version: 0,
    model: new BoardModel(),
    sender: null,

    setSender: (fn) => set({ sender: fn }),

    reset: (id) => {
      if (get().boardId === id) return;
      pending = [];
      pendingBoard = id;
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      set((s) => ({ boardId: id, model: new BoardModel(), version: s.version + 1 }));
    },

    receive: (boardId, payload) => {
      const st = get();
      if (st.boardId !== boardId) return;
      let changed = false;
      for (const op of parseBatch(payload)) changed = st.model.apply(op) || changed;
      if (changed) set((s) => ({ version: s.version + 1 }));
    },

    draw: (op) => {
      const st = get();
      if (!st.boardId) return;
      if (!st.model.apply(op)) return;
      set((s) => ({ version: s.version + 1 }));
      if (!st.sender) return;
      pending.push(op);
      pendingBoard = st.boardId;
      if (!flushTimer) flushTimer = setTimeout(() => flush(), FLUSH_MS);
    },

    nextOpId: () => `${deviceTag}${(++seq).toString(36)}`,
  };
});
