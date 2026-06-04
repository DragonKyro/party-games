export type ConnectionState = 'disconnected' | 'connecting' | 'lobby' | 'in-game';
export type LocalRole = 'solo' | 'host' | 'guest' | 'spectator';

export interface Seat {
  uuid: string;
  name: string;
}

// Game-specific settings are opaque to the platform; the active module owns
// the schema. Stored as a JSON-indexable blob and edited via the module's
// SettingsPanel.
export type GameSettingsBlob = Record<string, unknown>;

export interface LobbyState {
  seats: Seat[];
  hostUuid: string;
  // Empty string = no game selected yet.
  selectedGameId: string;
  // Keyed by gameId so guests can preview settings without losing them when
  // the host toggles between games.
  gameSettings: Record<string, GameSettingsBlob>;
  seed: number;
}

export interface HelloMessage {
  uuid: string;
  displayName: string;
}

// Initial broadcast from host when the game starts. Game-specific state shape
// is the active module's concern.
export interface StartMessage {
  gameId: string;
  publicState: unknown;
  settings: GameSettingsBlob;
  seats: Seat[];
  hostUuid: string;
  seed: number;
}

// Public action envelope — every peer reduces identically using the active
// module's reducer.
export interface ActionEnvelope {
  action: unknown;
  byUuid: string;
}

// Host → single peer. The platform routes only to `target`; payload semantics
// are the game module's concern (Spyfall role, Fishbowl prompts on your turn,
// etc).
export interface PrivateMessage {
  target: string;
  payload: unknown;
}

// Late-joiner catch-up. The host sends current public state plus the joiner's
// private payload (if any) and the chat log.
export interface SnapshotRequestMessage {
  uuid: string;
}

export interface SnapshotMessage {
  gameId: string;
  publicState: unknown;
  settings: GameSettingsBlob;
  seats: Seat[];
  hostUuid: string;
  seed: number;
  chat: ChatMessage[];
  // Private payload addressed to the requester, if the host has one staged.
  privateForRequester?: unknown;
}

export interface ChatMessage {
  id: string;
  senderUuid: string;
  senderName: string;
  text: string;
  timestamp: number;
  kind: 'user' | 'system';
}
