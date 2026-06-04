import { create } from 'zustand';
import type { GameSettingsBlob, LobbyState, Seat } from '@/platform/net/types';
import { getGame } from '@/platform/game/registry';

// Host-authoritative lobby. The host owns the canonical `LobbyState` and
// broadcasts it on every change. Guests render `lobby` directly and submit
// edits via the host (TODO: lobby-edit channel — for now lobby settings are
// host-only, like Catan).
interface LobbyStoreState {
  lobby: LobbyState | null;
  setLobby: (lobby: LobbyState | null) => void;
  // Host-side mutators. Each returns the next lobby state so the network
  // layer can broadcast it.
  setSelectedGame: (gameId: string) => LobbyState | null;
  setGameSettings: (gameId: string, settings: GameSettingsBlob) => LobbyState | null;
  setSeats: (seats: Seat[]) => LobbyState | null;
  ensureGameSettings: (gameId: string) => LobbyState | null;
}

export const useLobbyStore = create<LobbyStoreState>((set, get) => ({
  lobby: null,
  setLobby: (lobby) => set({ lobby }),

  setSelectedGame: (gameId) => {
    const lobby = get().lobby;
    if (!lobby) return null;
    const next: LobbyState = { ...lobby, selectedGameId: gameId };
    // Seed defaults if this game has never been configured in this room.
    if (gameId && !next.gameSettings[gameId]) {
      const mod = getGame(gameId);
      if (mod) {
        next.gameSettings = {
          ...next.gameSettings,
          [gameId]: { ...mod.manifest.defaultSettings } as GameSettingsBlob,
        };
      }
    }
    set({ lobby: next });
    return next;
  },

  setGameSettings: (gameId, settings) => {
    const lobby = get().lobby;
    if (!lobby) return null;
    const next: LobbyState = {
      ...lobby,
      gameSettings: { ...lobby.gameSettings, [gameId]: settings },
    };
    set({ lobby: next });
    return next;
  },

  setSeats: (seats) => {
    const lobby = get().lobby;
    if (!lobby) return null;
    const next: LobbyState = { ...lobby, seats };
    set({ lobby: next });
    return next;
  },

  ensureGameSettings: (gameId) => {
    const lobby = get().lobby;
    if (!lobby || !gameId) return lobby;
    if (lobby.gameSettings[gameId]) return lobby;
    const mod = getGame(gameId);
    if (!mod) return lobby;
    const next: LobbyState = {
      ...lobby,
      gameSettings: {
        ...lobby.gameSettings,
        [gameId]: { ...mod.manifest.defaultSettings } as GameSettingsBlob,
      },
    };
    set({ lobby: next });
    return next;
  },
}));
