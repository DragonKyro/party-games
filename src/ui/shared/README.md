# ui/shared/

The cross-game UI kit. Presentation only — no game rules, no hidden information of its own.

## Theme (`theme.css`, imported once by `src/index.css`)

A night-time party: deep indigo surfaces, candy accents, chunky rounded type, big touch targets.

| Font variable | Face | For |
|---|---|---|
| `--font-ui` | Nunito | body text, controls |
| `--font-display` | Fredoka | titles, big words, scores |
| `--font-hand` | Patrick Hand | slips, sketchbooks, anything "handwritten" |

Tokens: `--bg-0..4`, `--line`, `--line-strong`, `--text`, `--text-dim`, `--text-faint`, `--paper`, `--paper-ink`, accents `--coral --sun --mint --sky --grape --pink --tangerine`, `--success --danger --warn`, `--team-0..3`, `--accent` (set per game by `GameShell` / setup / lobby), radii, shadows (`--lip` is the chunky sticker shadow), easing + durations.

Global classes: `pg-btn` (+ `pg-btn-primary | -good | -bad | -ghost`, sizes `-sm | -lg | -xl`, `-block`), `pg-card`, `pg-paper`, `pg-input`, `pg-chip` (+ `-accent`), `pg-kicker`, `pg-dim`, `pg-faint`, `pg-hand`, `pg-display`, `pg-sr-only`. Animations: `pg-fade-in`, `pg-rise-in`, `pg-pop`, `pg-shake`, `pg-bounce`, `pg-pulse`, `pg-wiggle`, `pg-float`, `pg-stagger` (children get `--i`). Keyframes are global names; inside a `.module.css` write `animation: global(pg-pop) …`.

## Components and hooks

- `hooks.ts` — `usePlay<View>()` (view, seat, isHost, localTable, online, dispatch, setSeat, exitGame, playAgain), `useNow`, `useFlash`, `seatColor`, `TEAM_NAMES` / `TEAM_COLORS` / `teamName`.
- `GameShell` — the frame for every game view (exit, title + status, right slot, room code, mute, how-to). `bare` hides the header; `wide` widens the body.
- `Countdown` — ring timer for any engine `Timer`, synced to the server clock; `beep` ticks the last seconds.
- `PassScreen` — "pass the device to …" cover for single-device play. Render it *instead of* the secret.
- `FinalResults` (+ `Confetti`) — end screen with ranking, highlights and play-again / exit.
- `CollectPanel` — the players-write-words phase, online and pass-the-phone.
- `TeamsPanel` — the pick-teams phase.
- `WordSourcePicker`, `PromptSourcePicker`, `ListManager`, `useSavedLists` — choosing packs / saved lists / player-written words.
- `controls.tsx` — `OptionSection`, `OptionRow`, `Stepper`, `Segmented`, `Toggle`, `formatSeconds`.
- `Modal`, `ChatPanel`.
- `draw/DrawPad.tsx` — `DrawPad` (canvas + tools) over a `BoardSource`: `useLiveBoard(id)` (streams to the room) or `useLocalBoard()` (private); `Sketch` renders a finished drawing.
- `sfx.ts` — synthesized sounds (`play('ding' | 'buzzer' | 'tick' | …)`), `vibrate`, per-device mute (`useSound`).
- `useWakeLock(active)` — keep the screen on during a turn.
- `svg.tsx` — `useSvgIds` for collision-free `<defs>` ids.
- `types.ts` — `OptionsProps`, `TileArtProps`.

## Seat switching (hidden-info rule for UIs)

Use `usePlay().setSeat` (backed by `useSeatSwitching()`) only on a single-device table, and only after the named player has tapped through a `PassScreen`. Online it does nothing — each device only ever sees its own seat.
