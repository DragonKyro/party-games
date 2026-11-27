# Forehead

Hold-it-to-your-head guessing for 2–20 players. The guesser has a card on their forehead with a word everyone else can see; the others shout clues. Tilt the phone face-down for "got it", face-up to pass. Scoring is individual.

## How it works

1. **Deck.** Built-in packs (default: Famous People, Pop Culture, Animals), the host's saved lists, and/or words every player writes at the start (`perPlayer`, off by default), in any combination. Everything is deduped. Player cards all go in and are shuffled together with enough pack/list cards for the match (`cardsNeeded`: rounds × players × ⌈turnSeconds / 4⌉ + 10). The rest of the (already shuffled) pool follows as a reserve, so a few player cards aren't drowned out by 450 pack words. Capped at 600 cards. A packs/lists-only deck needs at least 10 cards.
2. **Order.** Seats in table order, starting from a random seat; the same order every round. Each player guesses once per round; there are `rounds` rounds (1–3, default 1).
3. **Ready → 3-2-1 → turn.** The guesser (or the host) taps Start, which begins a 3-second countdown (`getReady`, ended by the scheduled `go`). Then the clock (`turnSeconds`, 30–120, default 60) runs and the first card goes up.
4. **Cards.** Correct (+1) or pass, then the next card. Every action carries the card's token (`card` = its deal number), so a double tap or two people tapping at once counts once. When the clock runs out, the card that was up counts as a miss.
5. **Results.** A list of every card from the turn with ✓ / ✗, plus the scoreboard. The guesser or the host taps Next.
6. **End.** After rounds × players turns, or when the deck is empty, or when the host finishes early. The final screen shows totals, the best single turn, and every card played with who wrote it.

## Dealing rules

- **Never your own card.** A card a player wrote (`PoolEntry.author`) is never dealt to them: `draw` takes the first card in the deck the guesser didn't write.
- **No repeats.** A dealt card never goes back in the deck, including cards passed and the card on screen at the buzzer.
- **Running low.** Views carry `deckLeft` and `lowDeck` (fewer cards than one brisk turn uses). The UI warns on the pass / ready / results screens. A turn whose deck runs dry ends at once (`end: 'deck'`), and an empty deck ends the match (`results.ranOut`). If everything left was written by the guesser, `outOfCards` is set and the host can skip them.

## Display modes (`display`)

- **`'forehead'`** (default, and the only mode on a single device; `createInitialState` forces it when no seat has a uid). The guesser's own phone shows the word, held to the forehead in landscape. Only the guesser marks cards (tilt or tap). Online, the other players' views also carry the word: they're the clue-givers.
- **`'others'`** (online). The guesser's device **never** receives the word. Everyone else's does, and any of them can tap Correct / Pass. The guesser's screen shows the countdown, the tally and its own Pass button. The guesser can't mark Correct.

## Hidden information

`foreheadViewFor` is the only place the word leaves the host:

- **The spectator view (`seat = null`) never has the word**, in either mode. It might be a TV the guesser can see, or the shared screen of a single device.
- **The guesser's view** has the word only in `'forehead'` mode, and not while their turn is paused (they lower the phone to see why). In `'others'` mode, never.
- **Clue-givers' views** have the word during the turn.
- **The deck** (contents and order), the top-up pool, card ids, authors and the RNG never appear in any view. Tokens are deal numbers, not ids.
- **Player-written cards** are private while collecting (`collect.yours` is your own only), public once played (in the results list), and attributed only on the final screen.

Tests check every seat and the spectator in both modes, that undealt deck words appear in no view's JSON, and that redacted views are byte-identical whichever card is up (spectator; guesser in `'others'`; paused guesser in `'forehead'`).

## Timing

- `start` → `getReady` with a 3-second `Timer`; `nextScheduled` returns `{ type: 'go', turn }` at its end.
- `go` → `turn` with the turn `Timer`; `nextScheduled` returns `{ type: 'timeUp', turn }` at its end, or null while paused.
- Both carry `turn` (= `turnNo`), so stale or early ones are refused.
- **Grace window (1.5 s):** a Correct that arrives after the buzzer but before `timeUp` is applied counts and ends the turn (no new card is dealt). One that arrives after `timeUp`, for the card that was up, flips that card to ✓ in the results. A Pass after the buzzer is refused.
- Host or guesser can pause / resume and stop the turn (stopping during the 3-2-1 cancels back to ready). The host can also skip a player (between turns) and finish the game.

## Tilt input (`ui/tilt.ts`, `ui/useTilt.ts`)

`nz = cos(beta°) · cos(gamma°)` is the screen normal's vertical component: about 0 on a forehead, −1 face-down, +1 face-up. `nz < −0.55` means correct; `nz > +0.55` means pass. **Hysteresis:** after firing (and at the start of every turn) the detector is disarmed until `|nz| < 0.3`, with a 400 ms cooldown. So holding it tilted fires once, and a phone picked up flat doesn't fire until it has been upright. The state machine is the pure `tiltStep`, unit-tested in `ui/tilt.test.ts`.

The Start tap (and Resume) calls `DeviceOrientationEvent.requestPermission()` (iOS), `requestFullscreen` and `screen.orientation.lock('landscape')`, all best-effort in try/catch (`ui/device.ts`). A Wake Lock keeps the screen on. The orientation is unlocked between turns, and fullscreen ends with the match. If the host started the turn for the guesser, an "Enable tilt" chip asks for permission on the held card.

**Fallbacks:** tap the top half to pass and the bottom half for got it. The zones are labelled and inset from the left / right edges where hands grip the phone, and a 450 ms gap stops a double tap marking the next card. On a keyboard, ↓ / Enter is correct and ↑ / Space is pass. A "turn the phone sideways" hint shows in portrait.

## Single device

1. Writing cards (if on) uses `CollectPanel`'s pass-the-phone roster.
2. Each turn starts with a `PassScreen` to the guesser ("I'm Ana — start"), keyed by `turnNo`. The tap claims the seat, asks for motion permission, goes fullscreen and starts the 3-2-1, all in one gesture. The seat-null screen behind it never contains a word.
3. During the 3-2-1 and the turn the screen is `GameShell bare`: one huge word on yellow, with small pause, clock, tally and tilt-status chips. Pause brings back the normal shell (exit, mute, help) with the word hidden.
4. Results: "Pass to Ben →" resets the screen to the seat-null view, and the next `PassScreen` follows.

## Feedback

On the device that marked the card: a full-screen green flash, `ding` and a vibration for correct; an orange flash and `pass` for a pass. Other screens flash when the tally moves; the guesser's phone also plays the sound. `buzzer` (and a vibration on the guesser's phone) when time runs out. The last 5 seconds tick, and so does the 3-2-1, on the guesser's phone.

## Files

- `rules.ts`: options, `readOptions`, `optionsProblem`, timing constants, deck sizing.
- `state.ts`: private state and the public view. `actions.ts`: the action union.
- `module.ts`: reducer, `foreheadViewFor` (the redaction chokepoint), `nextScheduled`.
- `module.test.ts`: setup, dealing, turns, timing, grace, host controls, redaction.
- `ui/tilt.ts` (+ test): the pure tilt state machine and word fitting. `ui/useTilt.ts`: the hook. `ui/device.ts`: permission, fullscreen, orientation lock.
- `ui/GameView.tsx` (+ `.module.css`, + `GameView.test.tsx` UI flow test), `ui/Options.tsx`, `ui/TileArt.tsx`.
