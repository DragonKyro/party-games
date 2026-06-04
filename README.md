# party-games

Fun user-input party games — Fishbowl, Rankit, HeadsUp, Telestrations, Spyfall, Skribbl, Wavelength — playable in a browser with friends. Static site hosted on GitHub Pages, peer-to-peer multiplayer over WebRTC.

## Stack

TypeScript, Vite, React, Trystero (WebRTC over BitTorrent trackers, no backend), Zustand, Vitest.

## Project layout

```
src/
├─ App.tsx                    # routes Home | Lobby | Game
├─ main.tsx
├─ index.css
├─ platform/                  # everything shared across games
│  ├─ net/                    # Trystero wrapper, identity, room codes
│  ├─ game/                   # GameModule contract, registry, seeded RNG
│  ├─ store/                  # Zustand: network, lobby, game, ui
│  └─ ui/                     # HomeMenu, LobbyScreen, GameShell, chat, shared widgets
└─ games/                     # one folder per game (currently empty — games scaffolded next)
```

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 (Vite default)
npm run typecheck
npm run test
npm run build        # outputs dist/
```

For local two-player testing in the same browser, open a second window with `?fresh` appended so it gets its own UUID via `sessionStorage`.

## Multiplayer model

- **Trystero `/torrent`** for signalling (BitTorrent trackers). App id `party-games-v1`; the 4-char room code doubles as the password for end-to-end encryption.
- **Persistent identity** via `localStorage` UUID — rejoin a room with the same seat after a refresh.
- **Host-authoritative.** The host owns the lobby state, validates actions, and emits both public action envelopes and targeted private payloads (Spyfall role, Fishbowl hand, etc).
- **Late-join snapshots.** Newcomer requests, host replies with public state + chat + the requester's private payload (if any).
- No anti-cheat — friends-only.

## Adding a game

1. Make a folder under [src/games/](src/games/) following the conventions in its [README](src/games/README.md).
2. Export a `GameModule<State, Action, Settings>` from `index.ts`.
3. Register it in [src/platform/game/registry.ts](src/platform/game/registry.ts).

The home picker and lobby pick it up automatically.

## Roadmap

- [x] Scaffold (config, deploy workflow, platform layers, lobby + chat shell)
- [ ] **Spyfall** — first game; smallest scope, exercises private envelopes
- [ ] **Wavelength** — spectrum + reveal
- [ ] **Fishbowl** — 3 rounds × team scoring + timer
- [ ] **HeadsUp** — single-active-player phone-on-forehead UX
- [ ] **Rankit** — bulk prompt input + sort UI
- [ ] **Drawing canvas subsystem** — shared by the next two
- [ ] **Telestrations** — chain rotation + reveal carousel
- [ ] **Skribbl** — realtime strokes + guess matching

## Deploy

Push to `main`. The [GitHub Pages workflow](.github/workflows/deploy.yml) builds and publishes `dist/`. Repo Pages source must be set to "GitHub Actions" in repo Settings → Pages.
