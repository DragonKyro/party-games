# platform/net

Trystero WebRTC wrapper.

- `room.ts` — `bindRoom(code)` opens a Trystero `/torrent` room and returns typed channels. `makeChannel<T>(name)` is the escape hatch for per-game freeform streams (strokes, etc).
- `identity.ts` — persistent UUID + display name in `localStorage` (or `sessionStorage` with `?fresh`). Also generates 4-char room codes.
- `types.ts` — wire schemas (`HelloMessage`, `LobbyState`, `StartMessage`, `ActionEnvelope`, `PrivateMessage`, snapshot, chat).

Consumed only by `platform/store/networkStore.ts`. Don't import from anywhere else.
