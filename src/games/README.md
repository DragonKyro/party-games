# games/

One folder per game. Each folder exports a single `GameModule<State, Action, Settings>` from its `index.ts`.

## Conventions

```
src/games/<id>/
├─ manifest.ts         # name, tagline, player range, default settings, SettingsPanel
├─ types.ts            # State, Action, Settings types
├─ reducer.ts          # pure applyAction(state, action, ctx)
├─ reducer.test.ts
├─ content/            # word lists, location decks, prompt packs
├─ phases/             # one component per game phase
├─ GameScreen.tsx      # reads gameStore, dispatches actions, renders the active phase
├─ LobbyPanel.tsx      # the SettingsPanel impl used by manifest
└─ index.ts            # default-exports the GameModule
```

After adding a game, register it in [platform/game/registry.ts](../platform/game/registry.ts):

```ts
import fishbowl from '@/games/fishbowl';
export const GAMES: ReadonlyArray<GameModule> = [fishbowl, ...];
```

## Privacy / hidden info

If your game has secret per-player data (Spyfall role, Fishbowl prompts on your turn, Telestrations chain step), return it from the reducer as `{ state, privates: [{ target: uuid, payload: ... }] }`. The host routes each `payload` to the addressed peer via the private channel and re-sends it on late-joiner snapshots. Don't put secret data on the public state.

## Real-time / timers

The reducer is synchronous and pure — for timer-driven games (HeadsUp, Skribbl), have the host run a clock and dispatch timeout actions through the normal channel. The platform doesn't ship a scheduler yet; the first game that needs one should add it under `platform/game/`.

## Planned games

- [ ] **Spyfall** — small, exercises private envelopes
- [ ] **Wavelength** — spectrum + reveal
- [ ] **Fishbowl** — 3 rounds × team scoring + timer
- [ ] **HeadsUp** — single active player, phone-on-forehead UX
- [ ] **Rankit** — bulk submit + sort UI
- [ ] **Telestrations** — uses the canvas subsystem + chain rotation
- [ ] **Skribbl** — uses the canvas subsystem + realtime stroke sync + word guessing
