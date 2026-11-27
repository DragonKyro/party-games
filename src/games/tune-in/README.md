# Tune In

Spectrum guessing on a radio dial. Each round a rotating **Tuner** gets a secret spot on a 0–100 dial that runs between two opposites (“Cold ↔ Hot”) and writes a clue that sits exactly there. Everyone else tunes a needle to where they think the station is. 2–16 players.

The dial is drawn as an FM tuning band: 0–100 maps onto 88.0–108.0 “MHz”, so one step is one 0.2 MHz channel. The frequency is only a display; all logic uses 0–100.

## Rules as implemented

**Each round**
1. The Tuner is dealt **two spectrums** and a **secret target**: a uniform integer from 4 to 96 (never 0–3 or 97–100).
2. The Tuner picks one spectrum and writes a **clue**. The clue has whitespace collapsed, must not be blank, can be at most 40 characters, and can't be just one of the two end labels. That check ignores case, accents and punctuation, so “HOT!” is refused on Cold ↔ Hot. Emoji clues are fine.
3. The clue goes **on air**. The unchosen spectrum goes to the bottom of the deck.
4. Guessing, which depends on the mode (below).
5. **Reveal**: the target, every needle and the points. The host moves on to the next round.

**Scoring bands** (option `bands`, four strictly increasing distances, 1–50): with the default `[3, 8, 14, 20]`, a distance ≤ 3 scores 4, ≤ 8 scores 3, ≤ 14 scores 2, ≤ 20 scores 1, and anything further scores 0. The Options panel offers Tight `[2,5,9,14]`, Standard and Generous `[4,10,17,25]`; anything else valid shows as “Custom”.

**`mode: 'everyone'`** (default)
- Every non-Tuner privately moves their own needle (`move`) and then locks in (`lock`). A lock can't be undone. Once every guesser has locked, the reveal starts automatically.
- Each guesser scores by distance. The **Tuner scores the rounded-up average** of the guessers who placed a needle. A guesser who never touched the dial scores 0 and isn't counted in the Tuner's average, so an absent friend doesn't sink the Tuner.
- `rotations` (1–3, default 1): each player tunes this many times, so there are `players × rotations` rounds. The Tuner rotates in seat order from a random first seat.

**`mode: 'team'`** (co-op)
- There is **one shared needle**, starting at 50. Any non-Tuner, or the host / single-device table with a seatless action, can move it. Its position and the last mover are public, so everyone watches it move. The UI throttles moves to about 6 a second.
- Anyone except the Tuner, or the host, presses **Lock it in**. A deliberate lock counts even if nobody moved the needle off 50.
- The team total builds over `rounds` (5–12, default 8). The final **rating** is the total as a share of the maximum (4 × rounds played): Telepathic ≥ 85%, Crystal Clear ≥ 70%, Strong Signal ≥ 55%, Decent Reception ≥ 40%, Patchy Static ≥ 25%, otherwise Dead Air. Each tier has its own line. The results screen also ranks players by the points their clues earned.

**Guessing timer** (`guessSeconds`: 0 = off, 60, 90). It starts when the clue goes on air. When it runs out, unlocked needles lock where they are and untouched ones score 0; in team mode, an untouched shared needle scores 0. The scheduled `timeUp` fires `GRACE_MS` (1.2 s) after the deadline, and moves and locks are still accepted during that window. The host can pause and resume.

**Host controls** (seatless)
- `skipTuner`, while the Tuner is choosing. In everyone mode that player's turn is forfeited and counts as a round. In team mode the next player tunes the same round. Both spectrums go back to the deck, and the next Tuner gets a fresh target.
- `reveal`, during guessing: stop now; needles lock where they are.
- `next`, from a reveal.
- `finish`, any time: straight to the results. An unfinished round isn't scored and its target is never shown.

**Race tokens.** `tune`, `move`, `lock` and `timeUp` carry `turn` (the view's `turnNo`, which increases with every Tuner turn, skips included), so anything from a finished round is refused.

## Spectrums

A `PromptSource` (`options.spectrums`), using any combination of:
- the built-in `SPECTRUMS`, plus `SPECTRUMS_SPICY` if the 18+ toggle is on (`src/words/prompts/spectrums.ts`);
- the host's saved lists of kind `'spectrums'`, one “Left | Right” per line, parsed with `splitPair`;
- **players writing spectrums**: a collect phase of kind `'pairs'`, `perPlayer` each.

Entries are deduped on both ends and malformed lines are dropped. Player-written ones come first and remember their author, who is credited at the reveal. The deck is shuffled, and when it runs low everything not already in it is reshuffled back in, so even a two-spectrum deck plays forever and the Tuner always gets two different options. Starting with fewer than 2 spectrums is refused, unless they come from players writing: if collection ends with fewer than 2, the built-in list is added so the game can't get stuck.

## Hidden information

`tuneInViewFor` is the only place anything is redacted. The view carries:
- `yourTarget`: **only the Tuner**, during the tune and guess phases. Everyone sees it in `reveal` after that.
- `yourOptions`: the two spectrums, **only for the Tuner**, and only while choosing. Once on air, the chosen `spectrum` and the `clue` are public.
- Everyone mode: `yourNeedle` holds only your own needle. Other players' needles are hidden until the reveal. `locked[]` (who has locked in) is public.
- Team mode: `shared` (value, touched, last mover) is public.
- Never sent: the RNG, the deck order, the card pool, the base pool, other seats' needles, `offer`, or the target of an unfinished round.
- Spectator views (`seat = null`) contain nothing secret. Tests check that every non-Tuner view, and the spectator's, is **byte-identical** across different targets and options (tune phase, and guess phase in both modes) and across other players' needle values. They also check that collected spectrums stay private while being written.

## Single device (`localPlay: 'pass'`)

1. **Tune**: a PassScreen to the Tuner (“show me the station”). After the claim the screen switches to the Tuner's seat: the target as a glowing band on the dial, two presets to pick from, and the clue box.
2. **Go on air**: the screen goes straight back to the seat-null view, behind a cover (“pass to the whole table”).
3. **Guess**
   - Team: the table discusses and drags the one needle (seatless moves and lock).
   - Everyone: a roster pass loop, like CollectPanel's. Tap a name, then a PassScreen, then that seat's private needle. **Lock it in** or **Not yet** (the needle is kept) hands the phone back to the roster.
4. **Reveal** and **results** on one screen (seat null).

The claims are per turn (`turnNo`) and reset at game over, so “Play again” starts clean.

## UI notes

- `ui/Dial.tsx` is the tuning band: a walnut bezel, a backlit glass gradient between the two end colours (picked per spectrum from a small palette), frequency ticks, and a glowing needle.
  - Dragging uses pointer events with capture and `touch-action: none`. It's also a keyboard `slider` (arrow keys, PgUp/PgDn, Home/End).
  - The reveal animation: a scan line sweeps to the station, the scoring zones bloom outwards, and pins and name chips drop in. Name chips are laid out greedily in lanes so they don't overlap.
- Needle input (`useNeedle`) shows your local value while you drag, sends throttled `move`s (one every 160 ms), flushes on release, and keeps your value until the host catches up (or for 900 ms). The ± buttons nudge by 1 step.
- Sounds: detent ticks every 5 steps, a pop on lock, a jingle when a clue goes on air, a whoosh, reveal and ding sequence at the reveal, and a tock as other players lock in.
- “Now playing” is the clue's VFD-style display, with an on-air light and an equaliser.

## Files

`rules.ts` (options, bands, clue checks, rating tiers) · `state.ts` · `actions.ts` · `module.ts` · `module.test.ts` · `ui/Dial.tsx` · `ui/GameView.tsx` · `ui/GameView.test.tsx` (single-device and own-device walk-throughs) · `ui/Options.tsx` · `ui/TileArt.tsx`.
