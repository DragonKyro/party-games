# Fishbowl

Team guessing for 4–20 players, played over several rounds with the **same** slips. Also known as Salad Bowl or Celebrity; a folk party game.

## How it works

1. **Fill the bowl.** Either every player secretly writes a few slips (names, things, phrases, inside jokes), or the host picks packs / saved lists, or both. Player slips always go in; packs and lists top the bowl up to *Slips in the bowl*.
2. **Teams.** Random balanced teams (2–4). Players can switch themselves; the host can move anyone, reshuffle, and start.
3. **Rounds.** Each round's rules card is shown first (default: Describe it → One word → Act it out; an optional "Sounds only" round exists). All slips go back in the bowl each round.
4. **Turns.** Teams alternate; within a team, clue-givers rotate. The clue-giver presses Start, then pulls slips one at a time: **Got it** (+1 to the team, next slip) or **Skip** (back into the bowl somewhere other than the top). The turn ends at the buzzer; the slip in hand stays in the bowl.
5. **Empty bowl.** The round ends at once. With *Carry over time* (default on) and ≥ 3 s left, the same clue-giver starts the next round with the leftover time; otherwise the next team goes.
6. **End.** After the last round, the team with the most slips wins. The final screen names the best clue-giver and reveals everything in the bowl with who wrote it.

## Files

- `rules.ts` — options (`readOptions` coerces untrusted lobby options), round definitions, `optionsProblem`, skip rules.
- `state.ts` — private state and the public view.
- `actions.ts` — the action union.
- `module.ts` — reducer, `fishbowlViewFor` (the redaction chokepoint), `nextScheduled`.
- `module.test.ts` — setup, teams, turns, rounds, timing and redaction.
- `ui/Options.tsx`, `ui/GameView.tsx`, `ui/Bowl.tsx`, `ui/TileArt.tsx`.

## Hidden information

- **The slip in hand** is in the clue-giver's own view only (`yourSlip`), and only during their turn. Tests check every other seat and the spectator view are byte-identical whichever slip is in hand, and that no bowl text appears in any view.
- **The bowl** is public only as a count. Slips guessed in a turn become public afterwards (`lastTurn` — everyone heard them).
- **Player-written slips** are private while collecting (`collect.yours` is your own only) and anonymous until the final screen.
- The RNG state and the top-up pool never leave the host.

## Timing

`startTurn` starts a `Timer` at `ctx.now`; `nextScheduled` returns `{ type: 'timeUp', turn }` at its end, which the host's scheduler applies (a stale turn token is refused). A "got it" up to 1.5 s after the buzzer still counts (network lag). The host can pause / resume.

## Single device

The device is passed to each clue-giver: a `PassScreen` ("I'm Ana — let's go") stands in front of every turn, keyed by the turn number, and only then does the slip screen render. Slip writing uses `CollectPanel`'s pass-the-phone roster.

## Rule notes

- Skips: any time (default), one per turn, or never. The last slip in the bowl can't be skipped.
- **Undo:** the clue-giver can take back the last "got it" of the turn (it returns to the bowl, the point is removed).
- The host can skip a player who stepped out and finish early.
