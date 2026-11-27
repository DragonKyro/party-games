# Sketch & Guess

Draw-and-guess for 2–16 players. One person draws a secret word on the live board while everyone else races to guess it. Our own take on a folk party-game genre.

## How it works

1. **Words.** From packs (default: Everyday, Animals, Food, Actions, the drawable ones), the host's saved lists, and/or words the players write at the start (`collect` phase). Player-written and host-list words are offered before pack words; nobody is ever offered a word they wrote; a word drawn once never comes back. If a drawer has nothing left they didn't write, their turn is skipped; when the words run out, the game ends.
2. **Turns.** The drawing order is shuffled once and kept for every round; everyone draws once per round (`rounds`, 1–5).
   - **choose**: the drawer privately picks 1 of 3 words. Online, there are 15 s, then one is picked at random (`chooseTimeUp`). A single-device table has no timer, because passing the device takes a while.
   - **drawing**: `turnSeconds` (30–180, default 80).
   - **reveal**: the word and the turn's points, for 6 s (`next`, scheduled), or until the host taps *Next*.
3. **End.** Final scores with awards: *Best artist* (most points as drawer), *Fastest guess* (typed games), *Sharpest eye* (most first solves), plus every word with who drew it, how many got it and who wrote it.

## Guessing

- **Typed** (online default). Guessers type; the host checks each guess (`words/match.ts`):
  - correct: points depend on speed, from 100 for an instant solve down to 40 at the buzzer (rounded to 5s), plus +15 / +10 / +5 for the 1st / 2nd / 3rd solver. The feed says "Ana guessed it! +85", never the text. The solver now sees the word.
  - close (`isCloseGuess`), or wrong but containing the answer (`containsAnswer`): a private "So close!" that only the guesser sees.
  - wrong: public.
  - after solving, a player's messages are visible only to the other solvers and the drawer.
  - The drawer can't type. Each guess is rate-limited (one per 700 ms per seat, checked against `ctx.now`) and capped at 60 characters. The turn ends early once everyone has solved.
- **Spoken** (always on a single device). Everyone shouts; the drawer (or the host) taps names in the order people got it, scoring 100 / 80 / 65 / 50, then 40 each. Tapping a name again takes the tap back, and later solvers move up. *Done* / *Nobody got it* ends the turn; so does the buzzer. The turn doesn't end by itself when everyone's tapped, so a mis-tap can still be fixed.
- The **drawer** earns 25 per solver in both modes.
- **Grace window:** guesses and taps up to 1.2 s after the buzzer still count, at the minimum points. The scheduled `timeUp` fires at `endsAt + 1.2 s`.

## Hints

With *Hints* on (default), everyone who doesn't know the word sees its blanks (`hintCells`: letters as `_`, with spaces and punctuation shown, plus each word's length). Scheduled `hint` actions reveal letters at 50% and 75% of the drawing time, at most a third of the letters overall, in positions picked by the seeded RNG when the word is chosen. Stages that would reveal nothing aren't scheduled. Hints off: no blanks.

## Live board

`liveBoard(state)` returns `{ id: 'sk-<matchNonce>-<turnNo>', drawerSeat }` during choose, drawing and reveal. A new id each turn wipes the board, and the same id keeps the picture up through the reveal. The nonce is the match start time (not secret), so "play again" in the same room gets fresh boards. Strokes never enter game state. The UI uses `useLiveBoard(view.boardId)`; only the drawer's `DrawPad` is enabled (online), or the shared device's (single device).

## Hidden information

`sketchViewFor` is the only redaction point:

- **The three choices:** in the drawer's view only, during choose.
- **The word:** in the drawer's and solvers' views while drawing; everyone's at the reveal. Everyone else gets only the hint cells.
- **Correct-guess text:** never in any view (solved entries carry no text).
- **Close / answer-containing guesses:** the guesser's view only.
- **Solver chat:** solvers and the drawer only. Spectators (seat `null`) see public entries only.
- **Feed bookkeeping:** keys are numbered per visibility class, and each class is capped at 50 entries separately. So what one viewer sees never depends on entries hidden from them: no id gaps, and private lines can't push public ones out.
- **Player-written words:** private while collecting (`collect.yours`), anonymous until drawn (the reveal says who wrote it).
- **Never leaves the host:** the RNG, the word pool and deck, the hint plan, rate-limit stamps, the drawing order (visible only as it happens).

Tests check that secrets are absent from the JSON of every other seat's view and the spectator's, and that those views are byte-identical whichever word is drawn, whatever was offered, and whether a hidden near miss happened.

## Single device

`localTable` (every seat has no uid) forces spoken guessing. The shared screen shows the public view. Before each turn a `PassScreen` names the artist; tapping it switches to the artist's view to show the three words (rendered *instead of* the cover). Once a word is picked, the screen returns to the public view. The artist draws on the device while everyone watches and shouts, and the artist taps who got it. **Hold to peek** switches to the artist's view only while held, so the word is in the DOM only then.

## Host controls

Pause / resume (choose, drawing, reveal: the schedule stops while paused; typed guesses are refused while paused). Skip a drawer who's choosing (their words go back in the deck). *End turn* during a typed drawing (points so far count; the reveal says "Turn over"). *Finish game* (banks a drawing in progress).

## Files

- `rules.ts`: options (`readOptions`, `optionsProblem`), timing, scoring (`guessPoints`, `spokenPoints`, `hintPlan`).
- `state.ts`: private state and public view types.
- `actions.ts`: the action union.
- `module.ts`: reducer, `sketchViewFor`, `sketchNextScheduled`, `liveBoard`.
- `module.test.ts`: options, setup, choosing, typed and spoken guessing, hints and timing, host controls, results, redaction.
- `ui/Options.tsx`, `ui/GameView.tsx` (+ `GameView.module.css`), `ui/TileArt.tsx`, `ui/GameView.test.tsx`: DOM-level secrecy on one device, the online guesser, artist and TV.
