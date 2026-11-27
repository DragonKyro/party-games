# Doodle Telephone

Draw what you read, guess what you see. Every player's sketchbook goes round
the table, alternating drawings and guesses, and then everyone watches the
prompts fall apart, page by page. 3–16 players.

## Rules as implemented

- **Sketchbooks.** One per player. Page 0 is the prompt:
  - **Write your own** (`words.perPlayer > 0`, always 1 here): a collect phase
    (`words/collect.ts`, `<CollectPanel>`). If the host stops waiting
    (`collect.close`), anyone who didn't write gets a prompt dealt from the
    packs. With no packs chosen, the default packs stand in.
  - **Pick one of three** (otherwise): each player is dealt 3 prompts from the
    pool (packs + host lists; default packs `actions`, `idioms`, `everyday`,
    `characters`), with no repeats round the table while the pool lasts. A
    pick may be changed until everyone has picked. The host can stop waiting
    (`advance` step 0); stragglers get their first option.
- **Passing.** Book `b` at step `s` is held by seat `(b + s) % n`. Odd steps
  draw the page before, even steps guess it.
- **Chain length** (`chainLength`). Every other player once: `n − 1` steps
  after the prompt. If that would end on a drawing (an even table), one more
  guess is added, which falls to the book's owner ("it's back to you!").
  `maxSteps` caps the chain for big groups; an odd cap is rounded up so a book
  still ends on a guess.
- **Simultaneous steps.** Phase `step`, `stepIndex` 1…`totalSteps`. Each seat
  hands in exactly one page per step for the book it holds:
  - `draw` — an encoded drawing, validated with `decodeDrawing` (≤
    `MAX_ENCODED_DRAWING`, palette, bounds) and stored re-encoded (canonical).
    The UI sends `encodeToFit(board.model.drawing())`, which is
    `encodeDrawing(simplifyDrawing(…))` and only simplifies harder (or drops the
    newest strokes) if that wouldn't fit.
  - `guess` — text, whitespace collapsed, 1–60 characters.
  - Every page carries the `step` token; a page for a finished step, a second
    page, or the wrong kind is refused.
  - When the last page is in, the step closes at once.
- **Timers** (online). Draw 75 s, guess 30 s by default, or untimed. The clock
  is a `Timer` in state; `nextScheduled` returns `timeUp` at `endsAt + 2 s`
  (grace, so pages racing the buzzer count). Time-up fills the gaps — a blank
  page or "(no guess)", marked `missed` — and moves on. The UI auto-submits
  whatever is on the canvas when its countdown hits 0 (an empty guess is left
  for the host to fill).
- **Host controls.** `hurry` (online: everyone gets 10 s, never more than they
  had; untimed games get a 10 s clock), `advance` (move on now, gaps filled),
  `finish` (during steps: reveal the books as they are — books whose current
  page wasn't in yet end one page earlier; during the reveal or step 0: the
  results).
- **Reveal.** Phase `reveal`, a shared cursor `{ book, shown }`. A book opens
  with its prompt showing. Its owner (or the host; on one device, the device)
  sends `revealNext` (token: `book` + `shown`, so double taps are refused),
  then `nextBook`; after the last book, the results.
- **Hearts.** `heart { book, page, on }` — one per player per page, idempotent
  on/off, only on the current book's revealed pages, never your own, never a
  missed page or a dealt prompt (written prompts can be hearted).
- **Results.** `<FinalResults>` ranked by hearts received (split drawings /
  words), the crowd favourite (most hearts, earliest on ties, shown with the
  page before it), and a replay list of every book.

## Hidden information

`viewFor` is the only redaction point. Tests cover every seat and the
spectator, check content markers are absent from the view JSON, and check views
are identical when only hidden pages differ.

- **Step 0.** Dealt prompts and picks are in the chooser's view only
  (`choices`, `picked`). Written prompts: your own only (`collectView`).
- **Steps.** A seat's view holds ONLY `held`: the book it holds (index, owner),
  what to add, and the **previous page** of that book (prompt/guess text or a
  drawing). Nothing else from any book. Once you've handed in your page,
  `held` is null. Progress is public: `done[]` per seat and `doneCount`.
- **Spectators** (seat null) get progress only until the reveal.
- **Reveal.** Only the current book, pages up to the cursor. Heart counts and
  who hearted are public.
- **Results.** Every book as **text** (prompts and guesses; drawings appear only
  as "drawn by"). A screen gets one book's drawings by opening it (`browse`;
  per seat, or seatless for a shared / single-device screen), plus the
  favourite (at most two drawings). No view ever carries every drawing.
- **View size.** A reveal / opened book carries at most
  `VIEW_DRAWING_BUDGET` (160 KB) of drawings, newest first; older pages of a
  very detailed book go out as `drawing: null` ("scrolled away"). Keeps every
  view under the database's 300 KB limit even at the 40 KB cap per drawing.
- The RNG state never leaves the host.

## Single device

A table with no seat uids (`config.seats[*].uuid === null`) sets
`state.local`: there is **no shared step clock** (people go one after another,
so a shared 75 s would be gone before the phone reached the third player).
Instead each player's clock starts when they take the phone (UI-side `Timer`),
and the same auto-submit applies. `hurry` is refused; the host uses "Skip to the
next step".

Each step is a roster loop (the `CollectPanel` pattern): tap your name →
`PassScreen` (rendered instead of the page) → `setSeat(you)` → see the previous
page → draw or guess → hand it in → `setSeat(null)` → back to the roster. The
reveal and the results are on the seat-less view; players heart a page by
tapping their own name chip under it.

## Options

| Option | Default | Notes |
|---|---|---|
| `words` | packs `actions, idioms, everyday, characters` | `perPlayer` 0 = pick 1 of 3, 1 = write your own |
| `timed` | true | ignored on one device (per-player clock instead) |
| `drawSeconds` | 75 | 20–240 |
| `guessSeconds` | 30 | 10–120 |
| `maxSteps` | 0 (no cap) | 2–30; odd values round up to end on a guess |

## Files

`rules.ts` (options, `chainLength`, `holderOf` / `bookHeldBy`, `cleanGuess`,
`encodeToFit`), `state.ts`, `actions.ts`, `module.ts`, `module.test.ts`;
`ui/GameView.tsx` (router + host bar), `ui/Steps.tsx` (step 0, draw / guess,
waiting, local roster), `ui/Reveal.tsx`, `ui/Results.tsx`, `ui/parts.tsx`,
`ui/Options.tsx`, `ui/TileArt.tsx`, `ui/GameView.test.tsx` (single-device and
online-seat UI flows).
