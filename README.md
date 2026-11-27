# party-games

Word party games for a room full of friends, hosted on GitHub Pages. **Bring your own words:** every game can use the built-in word packs, lists you've saved, or words the players write themselves at the start — in any mix.

**▶ Play:** https://DragonKyro.github.io/party-games/

Play with **everyone on their own phone** (host a room, friends join with a code or link — in the same room or over a video call), or on **one device** passed around the table. A laptop or TV can join a room as a **big screen** to show the game to everyone.

## The games

| Game | Players | In one line | Genre |
|---|---|---|---|
| [**Fishbowl**](src/games/fishbowl/README.md) | 4–20 | Everyone fills a bowl with slips; teams race through the same slips three times — describe it, one word, act it out. | the folk game (a.k.a. Salad Bowl, Celebrity) |
| [**Sketch & Guess**](src/games/sketch/README.md) | 2–16 | One player draws live, everyone else races to type the answer. Faster guesses score more; letter hints appear as time runs down. | draw-and-guess |
| [**Forehead**](src/games/forehead/README.md) | 2–20 | Hold the phone to your forehead; your friends shout clues; tilt down when you get it, up to pass. | heads-up guessing |
| [**Doodle Telephone**](src/games/telephone/README.md) | 3–16 | Write a phrase, draw the phrase, guess the drawing, draw the guess… then flip through every sketchbook and heart the best bits. | draw-and-pass telephone |
| [**Rank It**](src/games/rank-it/README.md) | 3–12 | A rotating Ranker secretly orders five things by a criterion ("most useful on a desert island"); everyone else tries to read their mind. Or play Crowd mode: match the group's consensus. | ranking |
| [**Odd One Out**](src/games/odd-one-out/README.md) | 3–12 | Everyone sees a board of 16 words and knows the secret one — except the outsider. Give one-word clues (or question each other), vote out the faker; a caught outsider can still steal the win by naming the word. | spy / hidden-outsider |
| [**Tune In**](src/games/tune-in/README.md) | 2–16 | The Tuner sees where a target sits on a radio dial between two extremes ("Cold ↔ Hot") and writes a clue; everyone tunes their needle. Solo scoring or a co-op shared dial. | spectrum guessing |
| [**Slideshow Karaoke**](src/games/slideshow/README.md) | 2–20 | Present a talk you've never seen: a procedurally generated deck (charts, tables, diagrams, pictures, quotes) appears one slide at a time, with optional plot twists and audience Q&A. The audience rates you. | presentation improv |

The games are our own takes on these party-game genres — original names, art and content (word lists, spectrums, criteria, slide phrase banks are all written for this app). Each game's rules, hidden-information model, options and single-device flow are in its README.

### Where the words come from

Every game has the same three choices, in any combination:

- **Built-in packs** — 17 packs (everyday things, animals, food, actions, places, jobs, famous people, characters, pop culture, idioms, sports, nature, holidays, tech, an easy kids' pack, a hard-mode pack, and an 18+ "after dark" pack), plus built-in Rank It criteria and Tune In spectrums.
- **Your saved lists** — paste in your own vocabulary (inside jokes, a class word list, a theme night). Lists are saved in your browser and only sent to the game when it starts, so guests can't peek.
- **Players write their own** — everyone types a few entries privately at the start of the match. Games keep your own words away from you where it matters (you never have to guess your own Fishbowl slip in Forehead, or draw your own word).

## Quickstart

```bash
npm install
npm run dev          # http://localhost:5173/party-games/
npm run test:run     # vitest single run
npm run typecheck    # tsc, no emit
npm run build        # production build to dist/
npm run fix-lock     # after any install: point package-lock.json back at registry.npmjs.org
```

Testing online play locally: open two tabs with `?fresh` (e.g. `http://localhost:5173/party-games/?fresh`) — each tab gets its own identity.

**Behind a corporate npm mirror?** If your machine sets `NPM_CONFIG_REGISTRY`, `npm install` writes mirror URLs into `package-lock.json`, which GitHub Actions can't reach. Run `npm run fix-lock` after any install that changes the lockfile; CI refuses a lockfile with non-public URLs.

## How online play works

Online play runs over **Firebase Realtime Database** (the shared `github-games-e7c7d` project; this app's data lives under `/party-games`). There's no server code: the host's browser runs the game, and the database relays messages and enforces who may read what.

1. The host picks a game and chooses **Everyone on their own phone**. A 5-letter room code and an invite link (`…/?room=CODE`) are generated.
2. Friends open the link (or type the code) and are seated automatically. The host can reorder or remove players, change options, and switch games between matches — the room stays open all night.
3. Each device signs in anonymously and silently. Reloading rejoins; a host who reloads resumes the game.
4. A TV or laptop can join with `?watch` (or "Join as a shared screen") to show the public view.

**Secrets stay secret.** The host holds the game state. After every move it writes each device its own redacted view to `views/{uid}`, and the security rules let only that device read it — your Fishbowl slip, the Sketch & Guess word, the Odd One Out secret and the Tune In target never reach anyone who shouldn't see them, even via devtools. Timers count against the server clock so every phone agrees on the buzzer. Drawing strokes stream through a separate live-board channel that only the current drawer may write to. Details: [CLAUDE.md](./CLAUDE.md) and [src/net/README.md](./src/net/README.md).

### Deploying the database rules

The database is shared with other apps and has a single rules set, so never deploy a rules file directly:

```bash
npm run deploy:rules   # merges database.rules.json's "party-games" key into the live rules, then deploys
npm run rules:smoke    # live check: guests read only their own view; only the drawer can draw; …
```

`scripts/merge-db-rules.mjs` (the predeploy hook) keeps every other app's rules exactly as they are live.

## Project layout

```
src/
  engine/      # GameModule contract, registry, seeded RNG, timers, teams, guards
  words/       # word packs, prompts, word sources, the players-write phase, guess matching, saved lists
  draw/        # drawings as data: strokes, encoding, live-board ops, canvas painting
  games/<id>/  # one folder per game: rules, state, module (+ redaction), tests, ui/, README
  net/         # Firebase room transport (+ in-memory fake for tests), identity, room links
  store/       # Zustand: gameStore (host state + scheduler), networkStore, boardStore, hostLogic, clock
  ui/          # catalog, home, setup, lobby, game router, shared kit (theme, timer, pass screen, pickers, draw pad…)
database.rules.json  # rules for the /party-games key only
scripts/             # merge-db-rules (safe deploy), smoke-rules (live check), fix-lockfile
```

## Status

### Done

- [x] **8 games playable end-to-end** online and on one device, each with a rules engine, a redacting `viewFor`, scheduled timers where needed, tests (rules, timing, and redaction for every seat and the spectator), an options panel, original SVG tile art and a README.
- [x] **Word sources everywhere:** 17 built-in packs (~2,500 entries, US English) + Rank It criteria (220) + Tune In spectrums (248); host's saved lists (kept out of the lobby); players-write-their-own phase with single-device pass-the-phone flow.
- [x] **Online rooms on Firebase RTDB:** per-device view mailboxes enforced by rules, open-table seating, game switching between matches, invite links, big-screen (`?watch`) mode, host-reload resume (debounced saves), presence + host-offline banners, chat, stale-room cleanup, server-clock-synced timers, a drawer-only live board for Sketch & Guess.
- [x] **Database rules deployed** (Nov 25 2026) via the merge script; the live smoke test passes (33 checks, including the board channel and the stale-room sweep).
- [x] **Verified in a real browser over the live database:** a 4-device Fishbowl session and a Sketch & Guess session with live drawing on a TV screen; single-device flows of every game; Slideshow Karaoke decks rendered slide by slide.
- [x] **Independent review of the network / store layer** — fixed: a big-screen or second tab in the host's browser could become a second host; guests could ignore views after a host reload; a host reload could wipe the live drawing; a failed resume could delete the room; the stale-room sweep could stall; reconnecting spectators could stay stale; actions could leak across "play again". Each has a regression test.
- [x] **CI** (GitHub Actions): lockfile check, typecheck, 435 tests, build, Pages deploy.

### Left to do

- [ ] **Playtest on real phones with real people**, especially: Forehead's tilt-to-answer and the iOS motion-permission prompt (can't be exercised headless), Sketch & Guess drawing on touch screens, and a long session to see how the host's phone copes (if the host's phone sleeps, the game pauses for everyone until it wakes).
- [ ] **Confirm Rank It's rules.** "Ranker + guessers" is the default reading; Crowd mode is the alternative.
- [ ] Optional polish ideas: a shared pass-the-phone roster component (several games carry their own), a fill/bucket tool for drawings, a QR code for the invite link, sounds on the big screen only.

## Deployment

GitHub Pages deploys on push to `main` via `.github/workflows/deploy.yml` (lockfile check → typecheck → tests → build). The Vite `base` is `/party-games/`. In the repo settings, set **Pages → Source** to **GitHub Actions** once. Database rules deploy separately (above).

## Non-goals

Accounts, matchmaking, public lobbies, persistent stats, AI players, server code, voice chat (you're in the same room, or on a call), anti-cheat (friends only).
