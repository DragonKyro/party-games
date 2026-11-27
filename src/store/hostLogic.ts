// Pure host-side decisions for online play, kept out of networkStore so they
// can be unit-tested: who sits where, which inbound actions are accepted,
// and which redacted view each connected device receives.
//
// Identity: a seat's `uuid` is its occupant's Firebase uid, and every inbound
// message carries the sender's uid as verified by the database rules. The
// host therefore derives the acting seat from the sender's uid and never
// trusts a seat number claimed inside the payload.
//
// Party tables are open: joining appends you to the end of the table, leaving
// removes your seat (everyone after you shifts down). Seats are frozen while
// a match runs; late arrivals watch until the next match.

import type { GameModule, PublicEnvelope, Seat, SeatIndex } from '@/engine/types';
import type { LobbyState, ViewRecord } from '@/net/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModule = GameModule<any, any, any>;

export const MAX_NAME = 20;

export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
}

/** The seat held by `uid`, if any. */
export function seatOf(lobby: LobbyState, uid: string): Seat | null {
  return lobby.seats.find((s) => s.uuid === uid) ?? null;
}

function reindex(seats: Seat[]): Seat[] {
  return seats.map((s, i) => ({ ...s, index: i }));
}

/** A name nobody else at the table is using ("Sam", "Sam 2", …). */
export function uniqueName(seats: Seat[], uid: string, wanted: string): string {
  const base = cleanName(wanted) || 'Player';
  const taken = new Set(seats.filter((s) => s.uuid !== uid).map((s) => s.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, MAX_NAME - 3)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * A guest asks to play (or renames). Returns the new lobby, or null when the
 * request is refused or changes nothing. Mid-match only a rename of a seat
 * you already hold is allowed.
 */
export function applyJoin(lobby: LobbyState, uid: string, rawName: string, maxPlayers: number): LobbyState | null {
  const mine = seatOf(lobby, uid);
  const name = uniqueName(lobby.seats, uid, rawName);
  if (mine) {
    if (mine.name === name) return null;
    return { ...lobby, seats: lobby.seats.map((s) => (s.uuid === uid ? { ...s, name } : s)) };
  }
  if (lobby.inGame || lobby.seats.length >= maxPlayers) return null;
  return { ...lobby, seats: [...lobby.seats, { index: lobby.seats.length, uuid: uid, name }] };
}

/** A guest stands up. Refused mid-match (their seat is in play). */
export function applyLeave(lobby: LobbyState, uid: string): LobbyState | null {
  if (lobby.inGame || !seatOf(lobby, uid)) return null;
  return { ...lobby, seats: reindex(lobby.seats.filter((s) => s.uuid !== uid)) };
}

/** Host removes a seat (never their own). */
export function removeSeat(lobby: LobbyState, index: SeatIndex, hostUid: string): LobbyState | null {
  const seat = lobby.seats[index];
  if (lobby.inGame || !seat || seat.uuid === hostUid) return null;
  return { ...lobby, seats: reindex(lobby.seats.filter((_, i) => i !== index)) };
}

/** Host moves a seat one place up or down the turn order. */
export function moveSeat(lobby: LobbyState, index: SeatIndex, delta: -1 | 1): LobbyState | null {
  const to = index + delta;
  if (lobby.inGame || index < 0 || to < 0 || index >= lobby.seats.length || to >= lobby.seats.length) return null;
  const seats = lobby.seats.slice();
  [seats[index], seats[to]] = [seats[to]!, seats[index]!];
  return { ...lobby, seats: reindex(seats) };
}

export type InboundVerdict = { ok: true; seat: SeatIndex } | { ok: false; reason: string };

/**
 * Decide whether the host applies an action sent by `uid`. The action must
 * carry `bySeat` equal to the sender's own seat: seatless actions (host
 * controls, timer expiries) are reserved for the host, and acting as another
 * seat is refused.
 */
export function vetInboundAction(lobby: LobbyState, uid: string, action: unknown): InboundVerdict {
  if (!lobby.inGame) return { ok: false, reason: 'no match running' };
  const seat = seatOf(lobby, uid);
  if (!seat) return { ok: false, reason: 'sender holds no seat' };
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return { ok: false, reason: 'malformed action' };
  }
  const bySeat = (action as { bySeat?: unknown }).bySeat;
  if (typeof bySeat !== 'number') return { ok: false, reason: 'seatless actions are host-only' };
  if (bySeat !== seat.index) return { ok: false, reason: `seat ${seat.index} tried to act as seat ${bySeat}` };
  return { ok: true, seat: seat.index };
}

/**
 * The view record each recipient gets: seated players their own seat's
 * redaction, everyone else (spectators, TV screens) the seat-null
 * redaction. The host's own uid is skipped (it renders from local state).
 */
export function buildViews(
  module: AnyModule,
  state: unknown,
  lobby: LobbyState,
  recipients: Iterable<string>,
  tick: number,
  hostUid: string,
): Record<string, ViewRecord> {
  const out: Record<string, ViewRecord> = {};
  const cache = new Map<SeatIndex | null, PublicEnvelope<unknown>>();
  for (const uid of recipients) {
    if (uid === hostUid || out[uid]) continue;
    const seat = seatOf(lobby, uid)?.index ?? null;
    let env = cache.get(seat);
    if (!env) {
      env = { gameId: module.id, tick, view: module.viewFor(state, seat), seat };
      cache.set(seat, env);
    }
    out[uid] = { match: lobby.match, env };
  }
  return out;
}

export interface LedgerEntry {
  /** Serialised seat + view last sent to this device. */
  key: string;
  /** Per-device view sequence number (sent as the envelope's `tick`). */
  seq: number;
}

/**
 * Keep only views whose content changed since this device's last one, and
 * stamp each with that device's own sequence number. Re-sending unchanged
 * views with the global action counter would let a guest count other
 * players' secret moves. Mutates `ledger`.
 */
export function stampChangedViews(
  ledger: Map<string, LedgerEntry>,
  views: Record<string, ViewRecord>,
): Record<string, ViewRecord> {
  const out: Record<string, ViewRecord> = {};
  for (const [uid, rec] of Object.entries(views)) {
    const key = JSON.stringify([rec.env.seat, rec.env.view]);
    const prev = ledger.get(uid);
    if (prev && prev.key === key) continue;
    const seq = prev ? prev.seq + 1 : 0;
    ledger.set(uid, { key, seq });
    out[uid] = { match: rec.match, env: { ...rec.env, tick: seq } };
  }
  return out;
}

/** What a guest has applied locally, for judging an incoming view. */
export interface AppliedView {
  match: number;
  session: string | undefined;
  gameId: string;
  tick: number;
}

/**
 * Guest side: is `rec` an out-of-date write to ignore? Only within the same
 * match AND the same host session: when the host reloads, its per-device
 * sequence restarts from the last save and may be lower than what the guest
 * already holds — those views are the truth now.
 */
export function isStaleView(current: AppliedView | null, rec: ViewRecord): boolean {
  if (!current) return false;
  return (
    current.match === rec.match &&
    current.session === rec.session &&
    current.gameId === rec.env.gameId &&
    rec.env.tick < current.tick
  );
}
