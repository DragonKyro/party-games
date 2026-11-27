import type { GameId, PublicEnvelope, Seat } from '@/engine/types';

export type ConnectionState = 'disconnected' | 'connecting' | 'lobby' | 'in-game';
/** 'spectator' = in the room without a seat (watching, or a shared TV screen). */
export type LocalRole = 'solo' | 'host' | 'guest' | 'spectator';

/**
 * The room's lobby, written only by the host and readable by everyone in the
 * room. **Never put hidden information here**: not the RNG seed, not the
 * host's saved word lists (options carry only list ids).
 *
 * Party tables are open: whoever joins takes the next seat, so `seats` is
 * simply the player list in turn order.
 */
export interface LobbyState {
  gameId: GameId;
  /** `seat.uuid` is the occupant's Firebase uid. */
  seats: Seat[];
  /** Per-game options (`GameConfig.gameOptions`). */
  gameOptions: Record<string, unknown>;
  /** True while a match is being played. Seat changes are refused then. */
  inGame: boolean;
  /** Match counter, bumped at each start so guests can tell matches apart. */
  match: number;
}

export interface ChatMessage {
  id: string;
  senderUuid: string;
  senderName: string;
  text: string;
  timestamp: number;
  kind: 'user' | 'system';
}

/** Someone connected to the room right now. */
export interface Presence {
  uid: string;
  name: string;
}

export interface RoomMeta {
  hostUid: string;
  createdAt: number;
  build: string;
}

/** Which live board is active and who may draw on it (Sketch & Guess). */
export interface BoardMeta {
  id: string;
  /** uid of the only device allowed to push ops. */
  owner: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPublicEnvelope = PublicEnvelope<any>;

/**
 * Guest → host messages. The transport stamps each with the sender's uid,
 * which the security rules verify, so the host never trusts a claimed
 * identity inside the payload.
 */
export type InboxMessage =
  /** Take a seat (or rename the one you hold). */
  | { kind: 'join'; name: string }
  /** Give up your seat and watch. */
  | { kind: 'leave' }
  /** `match` = the match the sender's screen shows; the host refuses actions for another match. */
  | { kind: 'action'; action: unknown; match?: number };

/** What the host writes to `views/{uid}`: the per-seat view for one match. */
export interface ViewRecord {
  match: number;
  env: AnyPublicEnvelope;
  /**
   * The host session (new on every host page load). A guest only enforces
   * "newer tick wins" within one session: after a host reload the view
   * sequence may restart lower than what the guest last saw.
   */
  session?: string;
}

/** What the host saves (host-only readable) so it can resume after a reload. */
export interface SavedHostState {
  match: number;
  gameId: GameId;
  tick: number;
  state: unknown;
  /** Each device's last view sequence number, so guests accept views after a resume. */
  viewSeq?: Record<string, number>;
}
