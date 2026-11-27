// `?room=CODE` in the address bar: set while in a room so a reload rejoins
// (and so the URL is an invite link), cleared on leave. Other query params
// (e.g. `?fresh`) are kept.

import { normalizeRoomCode } from './identity';

const PARAM = 'room';

export function roomFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(PARAM);
  return raw ? normalizeRoomCode(raw) : null;
}

/** Put the room (and, for a big-screen tab, `watch`) in the URL so a reload rejoins the same way. */
export function setRoomInUrl(code: string | null, opts: { watch?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set(PARAM, code);
    if (opts.watch) url.searchParams.set('watch', '');
  } else {
    url.searchParams.delete(PARAM);
    url.searchParams.delete('watch');
  }
  window.history.replaceState(window.history.state, '', url.toString().replace(/watch=(&|$)/, 'watch$1'));
}

/** True when the URL asks to join as a seatless big screen. */
export function watchFromUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('watch');
}

/** A shareable link that opens this app straight into room `code`. */
export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(PARAM, code);
  return url.toString();
}
