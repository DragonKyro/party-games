// Display name + per-tab testing mode + room codes.
//
// Online identity is the device's anonymous Firebase uid (kept by Firebase
// Auth in IndexedDB), so a seat survives a reload and the security rules can
// tie every write to its author. Nothing here is secret.
//
// Per-tab identity: with `?fresh` (local testing) or `?watch` (a big-screen
// tab) both the auth session and the display name live in sessionStorage, so
// the tab is its own device. `?watch` needs this: a TV window opened in the
// host's browser must never share the host's uid (it would resume as a
// second host and show the host's private seat to the room).

const NAME_KEY = 'party-games.name';

export function freshTabMode(): boolean {
  if (typeof window === 'undefined') return false;
  const q = new URLSearchParams(window.location.search);
  return q.has('fresh') || q.has('watch');
}

// Storage can be missing or throw (privacy modes, some test runtimes).
function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof window === 'undefined') return null;
    const s = freshTabMode() ? window.sessionStorage : window.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

export function getDisplayName(): string {
  try {
    return storage()?.getItem(NAME_KEY) ?? '';
  } catch {
    return 'Player';
  }
}

export function setDisplayName(name: string): void {
  try {
    storage()?.setItem(NAME_KEY, name);
  } catch {
    // Not persisted; the name still applies for this session.
  }
}

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export function generateRoomCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    s += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return s;
}

/** Uppercase, strip spaces/dashes. Returns null if it can't be a room code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
}
