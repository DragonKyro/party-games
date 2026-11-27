# CLAUDE.md

Context for Claude working in this repo. **Keep this file and [README.md](README.md) current** — update them as part of the work, not afterwards.

## What this is

A multi-game web app of **word party games** whose common thread is *user-supplied words*: **Fishbowl**, **Sketch & Guess** (draw-and-guess), **Forehead** (hold-it-to-your-head guessing), **Doodle Telephone** (draw/guess telephone), **Rank It**, **Odd One Out** (spot the player who doesn't know the secret word), **Tune In** (spectrum/dial guessing) and **Slideshow Karaoke** (improvise a talk over a random slide deck). Hosted on GitHub Pages. Played either with everyone on their own phone (an online room over Firebase Realtime Database) or on one device passed around. No server code — the host's browser is the authority.

Every game takes words from the same three sources, in any combination (see "Word sources"): **built-in packs**, the **host's saved lists**, and **words the players write** at the start of the match.

Sibling project: `../social-deduction` — the net layer, stores, rules-merge deploy, CI and hidden-info model were copied from it and adapted. Look there for precedent.

**Naming.** The games are original takes on party-game *genres*. Use our own names, art and content, never a commercial game's name, card text, art or look (the UI says "Sketch & Guess", not a trademarked name; spectrum cards, rank criteria and locations are our own writing).

## Current status

All eight games are implemented, tested and playable online and on one device (see README "Status"). Per-game specifics live in each `src/games/<id>/README.md`.

| Game | Folder | Notable pieces |
|---|---|---|
| Fishbowl | `fishbowl/` | reference implementation; carry-over time; undo |
| Sketch & Guess | `sketch/` | live board (`liveBoard`), typed vs spoken guessing, scheduled letter hints, per-visibility feed |
| Forehead | `forehead/` | tilt state machine (`ui/tilt.ts`), `display: 'forehead' \| 'others'`, device helpers (`ui/device.ts`) |
| Doodle Telephone | `telephone/` | simultaneous steps, encoded drawings in actions, reveal cursor + hearts, view size budget |
| Rank It | `rank-it/` | ranker / crowd modes, consensus scoring, tap-to-rank |
| Odd One Out | `odd-one-out/` | per-round category boards, clues / questions formats, last-chance + early guess |
| Tune In | `tune-in/` | radio-dial UI (`ui/Dial.tsx`), everyone / co-op team dial, scoring bands |
| Slideshow Karaoke | `slideshow/` | pure seeded deck generator (`deck.ts` + phrase banks `content.ts`), slide renderer (`ui/Slide.tsx`, `charts.tsx`, `pictures.tsx`) |

Open work: real-phone playtests (Forehead tilt / iOS permission in particular), confirm Rank It's rules with Kyle, and the polish list in the README.

## Tech stack (locked)

TypeScript (strict), Vite, React 19, Zustand, Firebase (Realtime Database + anonymous Auth, lazy-loaded), Vitest + jsdom + Testing Library. Fonts self-hosted via @fontsource (Fredoka, Nunito, Patrick Hand). No server code.

## Architecture

- **`src/engine/`** — pure, game-agnostic: the `GameModule` contract (`types.ts`), registry, seeded RNG (`rng.ts`), timers as data (`timer.ts`), teams + the teams phase (`teams.ts`), guards (`guards.ts`), presentation metadata type (`meta.ts`). No React/DOM/network.
- **`src/words/`** — built-in packs (`packs/`), Rank It criteria and Tune In spectrums (`prompts/`), word sources (`source.ts`), the players-write-words phase (`collect.ts`), typed-guess matching (`match.ts`), the host's saved lists in localStorage (`library.ts`, impure — UI/launcher only).
- **`src/draw/`** — drawings as data: strokes, palette, compact base64-VLQ encoding, simplification (`drawing.ts`), live board op log (`board.ts`), canvas painting (`paint.ts`).
- **`src/games/<id>/`** — one folder per game (see "Adding / writing a game").
- **`src/net/`** — room transport (Firebase RTDB) behind `RoomTransport`, in-memory `fakeTransport` for tests, identity, room codes, `?room=` links. See `src/net/README.md`.
- **`src/store/`** — Zustand: `gameStore` (host state, scheduler, seat gating), `networkStore` (rooms, lobby, chat, board wiring), `boardStore` (live drawing), `hostLogic` (pure host decisions), `clock` (server-aligned time).
- **`src/ui/`** — React. `catalog.ts` (UI registry: meta, tile art, lazy options + view per game), `home/`, `setup/` (one shared setup screen), `lobby/`, `game/` (router + online overlay), `shared/` (the kit — see below).

Game logic must not import from `src/ui`, `src/net` or `src/store`. Path alias `@/` → `src/`.

## Hidden info model

1. **The host holds the only complete state** (`Private`). Every device gets only `viewFor(state, seat)`; spectators/TV screens get `viewFor(state, null)`. **`viewFor` is the single redaction chokepoint.**
2. Online, the host writes each device's view to `views/{uid}`, readable only by that uid (database rules). One applied action → N different view writes.
3. The host validates every inbound action: sender uid → seat; `action.bySeat` must equal it. **Seatless actions are host-only** (host controls + the scheduler).
4. **The RNG seed and the host's saved lists never leave the host.** Lists travel in options only as ids; `GameConfig.lists` resolves them at start.
5. **Single device:** in game logic, a single-device table is one whose seats have `uuid === null` (online seats always carry a uid) — use it when e.g. a shared step clock makes no sense while one phone goes round. In the UI `localTable` is true, the screen shows the seat-null view by default, and every secret is behind a `PassScreen` the named player taps through (render the cover *instead of* the secret — never overlay it).
6. Views carry only what's needed to render. Anything time-based is a scheduled action, so `viewFor` is a pure function of state.

## Real-time model

- `applyAction(state, action, ctx)` gets `ctx.now` (host clock, server-aligned online) — **never call `Date.now()` in game logic.** Timers are `Timer` data (`engine/timer.ts`); copy them into views and render with `<Countdown timer={…}>`.
- `nextScheduled(state)` returns the next seatless action to apply at a time (`{ at, action }`), e.g. `{ type: 'timeUp', turn: 3 }`. The host's `gameStore` arms one timeout; include a token so a stale one is refused. Return null while paused / nothing pending.
- Guests count down against the same server clock (`store/clock.ts` — `serverNow()`, `useNow()`).
- Allow a short grace window for player actions that race the buzzer.

## Word sources

- `WordSource = { packs, listIds, perPlayer }` (`words/source.ts`). Use `readSource(raw, fallback)` on untrusted options and `buildPool({ source, lists: config.lists, collected })` to merge — it dedupes and remembers each player-written entry's `author` (so you can keep your own words away from you).
- `PromptSource = { builtIn, spicy, listIds, perPlayer }` for curated prompt lists (Rank It criteria, Tune In spectrums) — `buildPromptPool`.
- **Players write words**: embed a `CollectState` (`words/collect.ts`) while `phase === 'collect'`; route `collect.*` actions through `collectReduce`; move on when `collectComplete` (or on host `collect.close`); expose `collectView(state, seat, n)` and render `<CollectPanel>`. Kinds: `'words'` or `'pairs'` ("Left | Right").
- UI: `<WordSourcePicker>` / `<PromptSourcePicker>` in your Options panel.

## Live board (Sketch & Guess)

Strokes stream through the room's `board/` channel, not game state. A game exposes `liveBoard(state) → { id, drawerSeat } | null`; the host grants that seat's uid write access (rules enforce it) and a new id wipes the board. UI: `const board = useLiveBoard(view.boardId); <DrawPad source={board} enabled={iAmDrawer} />`. Finished drawings that are game state (Doodle Telephone) use `useLocalBoard()` + `encodeDrawing(simplifyDrawing(board.model.drawing()))` and travel in an action (≤ 40 KB).

## Multiplayer model

- Firebase RTDB project `github-games-e7c7d` (shared with Kyle's other apps); everything under `/party-games`. `database.rules.json` defines only that key; `scripts/merge-db-rules.mjs` (predeploy) merges it into the live rules. Deploy with `npm run deploy:rules`, verify with `npm run rules:smoke`.
- Identity = anonymous Firebase uid. `?fresh` keeps auth + name per tab (local testing with several tabs).
- 5-character room codes; `?room=CODE` joins on load; `?watch` joins as a seatless screen.
- **Open table**: joining guests sit down automatically (`join` inbox message); the host can remove / reorder players; seats freeze during a match; late arrivals watch until the next one. **Rooms outlive matches**: after a game everyone returns to the lobby and the host may switch games.
- Host reload resumes from the (debounced) host-only saved state. Host offline → the game pauses (guests see a banner). Timers keep their absolute deadlines.
- No anti-cheat — friends-only.

## Adding / writing a game

Folder `src/games/<id>/` with:

| File | Contents |
|---|---|
| `index.ts` | `export const <x>Module: GameModule<State, View, Action>` (+ type re-exports) |
| `meta.ts` | `export const meta: GameMeta` — title, tagline, players, duration, accent colour, how-to bullets, `localPlay` ('pass' \| 'shared' \| 'none') + `localNote`, `summary(options)` |
| `state.ts`, `actions.ts`, `rules.ts` | private state + public view types; action union (discriminated on `type`); options type, `DEFAULT_OPTIONS`, `readOptions(raw)`, `optionsProblem` |
| `module.ts` | the reducer, `viewFor`, `nextScheduled`, … |
| `module.test.ts` | rules, scheduling, and **redaction tests** (every seat + spectator; secrets absent from JSON; views identical when only hidden data differs) |
| `ui/Options.tsx` | **default export** options panel, props `OptionsProps` (`value`, `onChange`, `playerCount`, `online`) |
| `ui/GameView.tsx` | **default export** game screen, wrapped in `<GameShell gameId=…>` |
| `ui/TileArt.tsx` | `export function TileArt({ className })` — an inline-SVG illustration (320×200 viewBox, `preserveAspectRatio="xMidYMid slice"`) |
| `README.md` | rules as implemented, hidden-info model, single-device flow, option notes |

Then register it in `src/engine/registry.ts`, `src/engine/types.ts` (`GameId`) and `src/ui/catalog.ts` (+ `GAME_ORDER`).

**Shared UI kit** (`src/ui/shared/`): `usePlay<View>()` (view, seat, isHost, localTable, online, dispatch, setSeat), `useNow`, `seatColor`, `teamName`/`TEAM_COLORS`; `GameShell`; `Countdown`; `PassScreen`; `FinalResults` (+ `Confetti`); `CollectPanel`; `TeamsPanel`; `WordSourcePicker` / `PromptSourcePicker`; `controls` (`OptionSection`, `OptionRow`, `Stepper`, `Segmented`, `Toggle`, `formatSeconds`); `Modal`; `draw/DrawPad` (`DrawPad`, `Sketch`, `useLiveBoard`, `useLocalBoard`); `sfx` (`play('ding' | 'buzzer' | …)`, `vibrate`); `useWakeLock`; `useSvgIds`. Global CSS classes: `pg-btn` (+ `-primary`, `-good`, `-bad`, `-ghost`, `-sm`, `-lg`, `-xl`, `-block`), `pg-card`, `pg-paper`, `pg-input`, `pg-chip`, `pg-kicker`, `pg-dim`, `pg-faint`, `pg-hand`, animations `pg-pop`, `pg-rise-in`, … (`theme.css`). In `.module.css`, wrap global keyframes: `animation: global(pg-pop) …`.

**Fishbowl (`src/games/fishbowl/`) is the reference implementation** — copy its structure.

## Conventions

- Strict TypeScript; no `any` except at the engine-as-generic-host boundary (commented).
- Tests next to code (`x.ts` + `x.test.ts`). Game logic is pure: no DOM, React, network, `Date.now()` or `Math.random()` (use the seeded RNG kept in state: `cloneRng` before drawing, store the clone back).
- Throw to reject an action. Validate everything in an action (types, ranges, phase, whose turn); it comes from the network.
- Actions that can race (double taps, two players pressing at once) carry a token (`slip`, `card`, `turn`) so a duplicate is refused.
- Big touch targets, phone-first layouts, `prefers-reduced-motion` respected (global).

## Commands

- `npm run dev` — http://localhost:5173/party-games/
- `npm run build` — `tsc` then `vite build`
- `npm run test:run` / `npm run test` — Vitest
- `npm run typecheck`
- `npm run fix-lock` — **run after any install that changes the lockfile** (Kyle's machine uses a corporate npm mirror; CI refuses non-public lockfile URLs)
- `npm run deploy:rules` / `npm run rules:smoke` — merge-deploy the RTDB rules, then verify them live

## Deployment

`.github/workflows/deploy.yml` typechecks, tests, builds and deploys to GitHub Pages on push to `main`. Vite `base` is `/party-games/` (the repo name).

## Non-goals

Accounts, matchmaking, public lobbies, persistent stats, AI players (party games need people), server code, voice chat (use the room or a call), anti-cheat.
