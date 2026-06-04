// Persistent player identity. The UUID lives in localStorage and is reused
// forever for this browser profile so a player can rejoin a room with the
// same seat after refresh / network drop.
//
// Append `?fresh` to the URL to force a per-tab UUID via sessionStorage —
// useful when two browser windows in the same incognito session share
// localStorage and would otherwise claim the same seat.

const UUID_KEY = 'party-games.uuid';
const NAME_KEY = 'party-games.displayName';

function freshTabMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const q = new URLSearchParams(window.location.search);
    return q.has('fresh');
  } catch {
    return false;
  }
}

export function getOrCreateUuid(): string {
  const fresh = freshTabMode();
  try {
    const storage = fresh ? sessionStorage : localStorage;
    const existing = storage.getItem(UUID_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : fallbackUuid();
    storage.setItem(UUID_KEY, next);
    return next;
  } catch {
    return fallbackUuid();
  }
}

export function regenerateUuid(): string {
  const fresh =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : fallbackUuid();
  try {
    const storage = freshTabMode() ? sessionStorage : localStorage;
    storage.setItem(UUID_KEY, fresh);
  } catch {
    /* ignore */
  }
  return fresh;
}

export function getSavedDisplayName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveDisplayName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

function fallbackUuid(): string {
  const rand = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0');
  return `${rand()}-${rand()}-${rand()}-${rand()}`;
}

// Short, friendly room code (4 uppercase letters/digits, no ambiguous chars).
export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
