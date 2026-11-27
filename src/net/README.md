# net/

The room transport for online play: **Firebase Realtime Database** (project `github-games-e7c7d`, shared with other web apps), behind an interface so the stores can run against an in-memory server in tests. Everything this app stores lives under `/party-games` (`DB_ROOT` in `firebaseRoom.ts`).

- `transport.ts` — the interface (`RoomTransport` → `HostConnection` / `GuestConnection`, `HostEvents` / `GuestEvents`), payload `LIMITS` (must match the rules), `ServerUnreachableError`.
- `firebaseRoom.ts` — the Firebase implementation (anonymous sign-in, room layout, presence, server clock offset, live board, stale-room sweep). Loaded lazily by `networkStore`, so the SDK only downloads when someone goes online.
- `fakeTransport.ts` — test-only in-memory server that mirrors the access rules (each device only ever receives its own view; only the host reads the inbox; only the board's owner may draw).
- `types.ts` — lobby, chat, presence, board, inbox, view-record and saved-state types. `identity.ts` — display name, `?fresh` mode, room codes. `roomLink.ts` — `?room=CODE` in the URL.
- Security rules: `database.rules.json` at the repo root, covering only the `party-games` key. The database has **one** rules set for every app, so deploys go through `scripts/merge-db-rules.mjs` (the predeploy hook), which swaps this app's key into the live rules and keeps the other apps' keys untouched. `scripts/smoke-rules.mjs` checks the deployed rules live.

## Room layout (`party-games/rooms/{CODE}`)

| Node | Who reads | Who writes | Contents |
|---|---|---|---|
| `meta` | anyone signed in | creator, once | `{ hostUid, createdAt, build, v }` |
| `lobby` | anyone signed in | host | JSON `LobbyState` (players, game, options, `inGame`, `match`) — **never the seed or list entries** |
| `views/{uid}` | **only `{uid}`** | host | JSON `{ match, env }` — that device's redacted view |
| `host` | **only the host** | host | JSON saved private state (debounced), so a reloaded host resumes |
| `inbox/{pushId}` | **only the host** | anyone, as themselves | `{ uid, p }` — `join` / `leave` / `action`; the rules force `uid === auth.uid`; `p` < 48 KB (a finished drawing fits) |
| `chat/{pushId}` | anyone signed in | anyone, as themselves | `{ uid, name, text, at }` |
| `presence/{pushId}` | anyone signed in | its owner | `{ uid, name }`, removed by `onDisconnect` |
| `board/meta` | anyone signed in | host | `{ id, owner }` — the live drawing board and its only drawer |
| `board/ops/{pushId}` | anyone signed in | **only `owner`**, for the current `id` | `{ b, u, p }` — a batch of stroke ops |

The room deliberately has **no room-level `.read` rule**: rules cascade, so one would open `views/` — every player's secrets — to everybody.

The live board is public on purpose (the picture is meant to be seen); what's secret in Sketch & Guess (the word, correct guesses) goes through views like everything else.

Rooms are cleaned up like the other apps on the database: a `roomDays` / `roomIndex` day bucket, and each new room's host sweeps rooms over a week old that nobody is connected to.

## Rules of this layer

- No imports from `@/ui` or `@/store`. May import `@/engine` types.
- Keep it thin — no game rules here.
