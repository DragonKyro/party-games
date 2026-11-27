# Rank It

Each round deals a few random items and a criterion. Players put the items in
order from MOST to LEAST, shown as **“Most → least: <criterion>”**.

## Modes

### Ranker (default)

A rotating Ranker. Each round:

1. **Choose.** The Ranker privately sees two criteria and picks one, or writes
   their own (≤ 60 characters; a leading “most” / “the most” and trailing
   punctuation are dropped, since the UI already says “Most → least”). The
   dealt items are public during the choice, so everyone can start thinking.
2. **Rank.** The criterion goes public. The Ranker secretly orders the items
   and **everyone else guesses that order at the same time.** Anyone can
   re-send their order (to change it) until the reveal.
3. **Reveal** as soon as everyone has locked in, when the clock runs out, or
   when the host stops waiting.

Scoring per guesser: **2** per item in the exact place, **1** per item one
place off, **+3** for a perfect order (max `2k + 3`). The Ranker scores the
**guessers’ mean, rounded half up** (`Math.round`), over the guessers who
locked in. Guessers who didn’t lock in score 0 and are left out of the mean.
If nobody guessed, the Ranker scores 0.

`rotations` (1–3) sets how many times everyone is Ranker: `players × rotations`
rounds. The rotation starts at a random seat and goes round in seat order.

### Crowd

No Ranker. Each round’s criterion is drawn at random or, with
`crowdPick: 'chooser'`, picked by a rotating player (same two-options-or-write
screen; the chooser then ranks like everyone else). Everyone ranks privately.

**Consensus** = every item’s mean rank (1 = most) over the players who locked
in, sorted ascending. **Ties go to the item dealt first** (lower index in the
round’s item list — the order the tray shows them in). Each player scores
against the consensus with the same rule: 2 exact, 1 one off, +3 perfect.
Players who didn’t lock in score 0 and don’t count toward the consensus. A
round needs at least **2** rankings, otherwise it is void.

Fixed `rounds` (3–10).

### Void rounds

A round scores nothing — and play moves straight on to the next round, with a
“Round N was void” note — when:

- ranker mode: the Ranker didn’t lock in by the buzzer (`noRanker`);
- crowd mode: fewer than two people ranked (`tooFew`);
- the host skipped it (`skipped`, e.g. an absent Ranker in the choose phase).

A void round’s rankings are discarded, never revealed.

## Items and criteria

- **Items** use a `WordSource` (default packs Everyday, Food, Famous, Pop
  Culture, Animals; `perPlayer: 0`). **“Everyone writes the items”** is the
  star mode and sits at the top of the options panel. Player-written items are
  dealt before any pack or list item (shuffled), then the rest (shuffled).
- **Criteria** use a `PromptSource` over `RANK_CRITERIA` /
  `RANK_CRITERIA_SPICY`, the host’s `prompts` lists, and players writing their
  own. Player-written criteria go first too, and the chooser is offered other
  people’s criteria over their own when there’s a choice.
- Items within a round are always distinct. Nothing repeats until its pool has
  been used up; then the pool is reshuffled (minus what’s already in hand).
  The criterion that wasn’t picked goes back to the bottom of the deck.
- If both items and criteria are player-written, the collect phase runs twice:
  items, then criteria.
- **Top-ups:** if fewer than `itemCount` items exist once writing ends (the
  host stopped waiting, or duplicates collapsed), the Everyday pack tops the
  pool up. If fewer than two criteria exist, the built-in list tops them up.

## Phases

`collect` (items, then criteria, if players write) → `choose` (Ranker / crowd
chooser) → `rank` → `reveal` → … → `gameOver`. Crowd mode with random criteria
skips `choose`.

## Timer

Optional ranking time limit: off / 45 / 60 / 90 s, started when the criterion
is set. `nextScheduled` fires `timeUp` at `endsAt + 1.5 s`; orders that arrive
in that grace window still count. The host can pause / resume. On a single
device the clock is shared by everyone passing the phone (the options panel
says so).

## Host controls

Seatless and round-tokened: `reveal` (stop waiting), `skipRound`, `next`,
`pause` / `resume`, `finish`, `collect.close`.

## Hidden information

`viewFor` is the chokepoint:

- **Orders:** every submitted order (the Ranker’s and each guess) stays on the
  host until the reveal. A seat sees only its own (`yourOrder`).
- **Criteria on offer:** only in the chooser’s own view (`yourOptions`) during
  `choose`.
- **Lock-in status is public** (`submitted[]`), as are the timer and scores.
- **Player-written items and criteria** are private until dealt: the collect
  phase shows a seat only its own entries; afterwards a view carries only this
  round’s items (and the chosen criterion). Who wrote what appears only on the
  final screen.
- The RNG, the pools, the decks and the turn order never leave the host.

`module.test.ts` checks every seat and the spectator, JSON-searches for the
secrets, and compares views of states that differ only in hidden data.

## Single device

1. Pass to the chooser / Ranker (`PassScreen`): pick the criterion, and in
   ranker mode go straight on to ranking in secret.
2. Back to the table: a roster (Ranker first). Each player taps their name,
   gets a pass screen, ranks, and hands the phone back.
3. The reveal and the final results are shown on the shared (seat-null) view.

## Reveal and results

The answer counts up from LEAST to MOST; each item shows every player’s guess
as a coloured badge (initials + the place they gave it), ringed green for
exact, dashed amber for one off, faded otherwise. Then per-player points, the
Ranker’s average, and the running standings. Crowd reveals show each item’s
mean rank and flag ties.

Final awards: **Mind reader** (most guessing points), **Open book** (highest
average guess score on their rankings), **Closed book** (lowest, if not
everyone ties), **Hive mind** / **Free spirit** in crowd mode, and **Bullseye**
(most perfect orders).
