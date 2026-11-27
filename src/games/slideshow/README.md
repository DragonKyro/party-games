# Slideshow Karaoke

Improvised presentations over a random slide deck. Each player in turn gives a
talk they have never seen: a title like "The Hidden Economics of Penguins",
then slides one at a time. The audience rates every talk 1–5 stars.

## Rules as implemented

1. **Topics.** Optionally, everyone first writes 1–3 topics (`collect` phase).
   Each talk takes a topic from the word source (default packs: Everyday,
   Hard Mode, Jobs, Places, Animals) and builds a title from one of ~40
   templates. Player-written topics are used first, and **never given to their
   own author**. The pick favours authors who still have to present, so nobody
   ends up holding only their own. If nothing suitable is left, it falls back
   to the Everyday / Hard packs.
2. **Order.** Everyone presents once (or twice with "Talks each: 2"). Order is
   shuffled each round, and nobody presents twice in a row.
3. **Intro.** The presenter and the talk title are announced. The presenter (or
   the host for them) taps **Start talk**. The host may skip a presenter.
4. **Talk.** One slide at a time. The presenter clicks **Next / Back** on their
   phone, or anyone on the host's screen does (the shared laptop / TV). Arrow
   keys and presentation clickers (PageUp / PageDown) work there, and `F`
   toggles full screen. Next on the last slide ends the talk.
   - *Auto-advance* (off / 15 / 20 / 30 s): a scheduled `autoNext` moves the
     slide on, and every click restarts it.
   - *Talk timer* (off, or 1–5 min): when it runs out the talk ends where it is.
   - *Wildcard twist*: at a random slide mid-talk (slide 2 onwards on 6+ slide
     decks), a banner lands on every screen and stays for the rest of the talk.
   - The host can pause, which freezes the timers and the clicker.
5. **Q&A** (toggle): after the last slide, 1–2 audience questions written
   around the topic and the deck's motifs. The presenter or host taps Done.
6. **Rating.** Each audience member gives 1–5 stars and can change their vote
   until the reveal. Votes reveal when everyone is in, when the timer runs out
   (online, 15–90 s), or when the host taps "Reveal now". The reveal shows the
   average, a label ("Standing ovation") and an anonymous histogram.
7. **End.** Presenters are ranked by average rating (FinalResults). Awards come
   from the data: Most convincing, Crowd favourite (most 5★), Smoothest recovery
   (best talk with a twist), Marathon keynote / Lightning talk (longest /
   shortest), Most divisive (widest vote spread) and "As I mentioned earlier…"
   (most Back presses).

## The deck generator (`deck.ts`)

`generateDeck(seed | rngState, topic, extraWords, slideCount, { presenter })`
returns `SlideSpec[]`. It is pure data and deterministic, and an RNG state
passed in is copied, never advanced. `buildDeck` also returns the motifs.

- **Shape:** a title slide (title, subtitle, presenter + a silly role), then
  `slideCount − 2` middle slides, then a closer. `slideCount` is clamped to 4–10.
- **Middle types:** bullets (3–4), chart (bar 3–5 / line 4–6 / pie or donut 3–4,
  with silly axis titles and a gentle trend), table (3–4 rows × 3–4 columns of
  words, numbers, ✓/✗ and stars), image (procedural scene + caption), diagram
  (Venn 2–3, cycle 3–5, pyramid 3–4, 2×2 matrix, flow 3–4), big number, quote
  (a fictional character "(allegedly)", an invented expert, or "My grandma"), and timeline (3–5).
- **Coherence:** one theme per deck: a palette (9, each checked for lightness,
  chroma and colour-blind separation), a layout (classic / band / side / minimal
  / bold) and a type face (rounded / clean / serif). There are 2–3 motif words:
  up to two from `extraWords` (pack / list words the module passes in), the rest
  from our bank. They recur round-robin through titles, bullets, labels and
  captions, alongside the topic and a deck-wide pair of buzzwords and verbs.
- **Variety rules:** the same type never appears twice in a row. Every deck has a
  text, a visual and a data slide (4-slide decks: a visual and a data slide,
  since the title and closer are text). Charts, diagrams and scenes don't repeat
  inside a deck, nor do slide titles. Quote, table, big number and timeline
  appear at most once.
- **Uncluttered:** one main element per slide, plus a title and at most a short
  caption. Every string is clipped (`LIMITS`), and SVG labels shrink to fit.

All phrase banks (`content.ts`) are our own writing.

## Rendering (`ui/Slide.tsx`, `ui/charts.tsx`, `ui/pictures.tsx`)

A slide is a 16:9 size container, and every length inside is in `cqw`, so it
scales from a phone to a TV. Charts and diagrams are hand-rolled SVG with no
library. There are 11 flat-illustration scenes: landscape, city, abstract,
meeting, presenter, map, product, rocket, lightbulb, forest and ocean. Each is
drawn from `(scene, seed, palette)` with the engine's seeded RNG, so every device
draws the same picture.

## Hidden information

`viewFor` is the chokepoint:

- **The deck** lives only in host state. A view carries the slide on screen plus
  `slideIndex` and `slideCount`, never a later slide. That holds for the
  presenter too, and in the intro, where only the title is public.
- **The twist** and the slide it lands on stay hidden until the presenter reaches
  that slide. **Q&A questions** stay hidden until the Q&A.
- **Ratings:** each seat sees only its own vote (`rating.yours`) and who has
  voted. The reveal shows only the average and a histogram, never who gave what.
- **Player-written topics** stay out of every view until used. Deck motifs come
  only from pack / list words, so an unused topic can't leak through a slide.
  Authors are named only on the final screen.
- The RNG, the deck seed and the topic pool never leave the host.

Tests: `module.test.ts` (rules, scheduling, redaction across every seat plus a
spectator, identical views when only hidden data differs) and `deck.test.ts`.

## Single device (`localPlay: 'shared'`)

One laptop or TV shows the seat-null view: slides, and Next / Back for
whoever's presenting. The rating is the **Rating on one device** option:

- **Applause meter** (default): the crowd cheers and whoever holds the device
  taps how loud it got (Crickets → Roaring = 1–5★). This records one crowd
  reading (`applause` action), with no timer.
- **Pass to vote:** a roster of listeners. Each taps their name, gets a
  `PassScreen`, taps stars and passes it on. Votes are never shown before the
  reveal.

The module detects a single-device table from the seats (no uids) and stores
the choice as `ratingMode` (`phones` | `pass` | `applause`).

## Spectator / TV

The seat-null view is the main presentation display: a full-width slide
(`GameShell wide`), with the slide sized to fit the window height and a
full-screen button. Phones in the audience see the same slide, then the stars.

## Options

| Option | Default | Notes |
|---|---|---|
| `words` | Everyday, Hard, Jobs, Places, Animals; 0 per player | players may write up to 3 |
| `slides` | 6 | 4–10, title and closer included |
| `autoAdvance` | 0 | 0 / 15 / 20 / 30 s |
| `talkSeconds` | 0 | 0 / 60 / 90 / 120 / 180 / 300 |
| `twists` | on | |
| `qa` | on | |
| `rateSeconds` | 30 | online only, 15–90 |
| `localRating` | `applause` | single device only: `applause` / `pass` |
| `talksEach` | 1 | 1–2 |
