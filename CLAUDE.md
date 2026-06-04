# CLAUDE.md

Context for Claude working in this repo.

## What this is

A collection of short user-input party games (Fishbowl, Rankit, HeadsUp, Telestrations, Spyfall, Skribbl, Wavelength). Browser-based, hosted on GitHub Pages, peer-to-peer multiplayer over WebRTC. One game runs in a room at a time; players return to the lobby between games to pick the next one.

Modelled on the catan sibling project — same stack and same multiplayer pattern — but with shallower per-game logic, more hidden-information mechanics, and no AI.

## Tech stack (locked)

TypeScript, Vite, React, Trystero (`/torrent` strategy) for WebRTC P2P, Zustand for state, Vitest for tests. No backend — GitHub Pages is static-only.

## Architecture

Two layers in `src/`:

- **`src/platform/`** — everything shared across games. Subdirectories:
  - **`net/`** — Trystero wrapper. `bindRoom(code)` returns typed send/receive helpers for `hello`, `lobby`, `start`, `action` (broadcast), `private` (host → one peer), `snapReq`/`snap`, `chat`, plus `makeChannel<T>(name)` for per-game streams. Identity (UUID + display name) lives in `localStorage`. `?fresh` switches to `sessionStorage` so two windows in the same incognito session don't collide.
  - **`game/`** — pure logic. The `GameModule<State, Action, Settings>` contract (`types.ts`), the `GAMES` registry, and seeded mulberry32 RNG (`rngShuffle`, `rngPick`, `freshSeed`).
  - **`store/`** — four Zustand stores:
    - `networkStore` — owns the Trystero bindings. Connection state, role (`solo` | `host` | `guest` | `spectator`), peer map, chat, host-side `hostPrivateLog` (so late joiners can recover their hidden info). Registers a broadcast sink with `gameStore` on init.
    - `lobbyStore` — host-authoritative lobby (seats, `selectedGameId`, per-game `gameSettings` keyed by gameId).
    - `gameStore` — wraps the active module's state. `dispatch(action)` reduces locally + emits public + privates; `applyLocal(action, byUuid, now)` reduces silently for network receivers. `privateForMe` holds the latest private payload addressed to this peer.
    - `uiStore` — global toasts.
  - **`ui/`** — React components: `HomeMenu`, `LobbyScreen`, `GameShell`, `chat/Chat`, plus `shared/` primitives (`Button`, `TextField`, `RoomCode`, `PlayerList`). `theme.css` holds CSS variables.

- **`src/games/<id>/`** — one folder per game. Self-contained: types, reducer, settings panel, phase components, content (word lists, location decks, etc), and a `GameScreen` that reads from `gameStore`. Each exports a `GameModule` from `index.ts` and gets registered in `platform/game/registry.ts`.

The platform layer never imports from `games/`. Games never reach into another game's folder. They depend only on `platform/`.

## The GameModule contract

```ts
interface GameModule<State, Action, Settings> {
  manifest: {
    id: string;
    name: string;
    tagline: string;
    players: { min: number; max: number };
    defaultSettings: Settings;
    SettingsPanel: ComponentType<SettingsPanelProps<Settings>>;
    icon?: string;
  };
  createInitialState(input: { seats: Seat[]; settings: Settings; seed: number }):
    State | { state: State; privates?: { target: string; payload: unknown }[] };
  applyAction(state: State, action: Action, ctx: ActionContext):
    State | { state: State; privates?: { target: string; payload: unknown }[] };
  isComplete(state: State): boolean;
  GameScreen: ComponentType;
}
```

Two things to know:

1. **`privates` return.** When the reducer needs to give specific peers hidden info (Spyfall role, Fishbowl hand on your turn), return `{ state, privates: [...] }`. The host (and only the host) emits each `payload` to its `target` via the private channel and stashes it in `hostPrivateLog` so a late-joining peer can recover it via snapshot.
2. **`createInitialState` can also return privates.** That's how a game deals its opening hidden state (Spyfall hands out roles at game-start).

The reducer must stay pure. No `Date.now()` — pull `ctx.now`. No `Math.random()` — use seeded RNG from `@/platform/game/rng` against an `rngState` in `State`.

## Multiplayer model

- **Trystero `/torrent`**. App ID `party-games-v1`; room code = password for E2E encryption.
- **Stable identity.** Trystero peerIds are volatile; UUID via `localStorage` (`party-games.uuid`) is exchanged on `hello`.
- **Host-authoritative.** Unlike Catan (which trusts every peer to reduce identically), here the host has hidden state guests can't reduce against. Guests dispatch intent → host validates + reduces + broadcasts the public delta + sends targeted privates. Guests reduce the public action with `applyLocal`.
- **Action envelopes.** `{ action, byUuid }`. Receivers verify `byUuid` matches the sender's known UUID (anti-spoof, friends-only — no crypto signatures).
- **Late-join snapshots.** Newcomer joins → `hello` → host sends `lobby` (if pre-game) or `snap` (if mid-game) with public state, seats, chat, and the requester's private payload from `hostPrivateLog`.
- **Disconnect.** No reconnect logic yet — peer leaves → host removes their seat from the lobby; mid-game leavers stay in the seat list (their UUID is on the state) and can rejoin via the same room code.

## Conventions

- **No backend.** GitHub Pages only. Anything that needs persistence goes to `localStorage`.
- **No AI.** Out of scope vs Catan. Single-player solo mode exists in `networkStore.startSolo()` as a stub but no game ships solo support yet.
- **Mobile-first.** Party games get played on phones in the same room. Lobby and game screens collapse to single-column under 800-920px.
- **Content > logic.** Word lists, location decks, and prompt packs ship as static data under `games/<id>/content/`. Don't fetch them at runtime.
- **One game at a time per room.** After `isComplete(state)` the host pushes the room back to the lobby to pick the next game.

## Deploy

`.github/workflows/deploy.yml` builds on push to `main` and publishes `dist/` to GitHub Pages. `vite.config.ts` sets `base: '/party-games/'` to match the repo name. Repo Settings → Pages → Source = "GitHub Actions".

## What's done

- Repo scaffold: package.json, tsconfig, vite config, deploy workflow, favicon.
- `platform/net/` — Trystero wrapper with all channels including `private` and `makeChannel` escape hatch.
- `platform/game/` — `GameModule` contract, empty registry, seeded RNG.
- `platform/store/` — all four Zustand stores wired up with host-authoritative privates flow + late-joiner snapshots.
- `platform/ui/` — `HomeMenu`, `LobbyScreen` (game picker + per-game settings panel slot), `GameShell`, chat, shared widgets.
- Typecheck + build green.

## What's next

Games. The recommended order: Spyfall → Wavelength → Fishbowl → HeadsUp → Rankit → drawing-canvas subsystem → Telestrations → Skribbl. Spyfall first because it's the smallest game that fully exercises the `privates` flow and proves the platform contract.
