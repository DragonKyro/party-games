# Odd One Out

Everyone sees the same board of words. All but the outsider(s) also know which one is the **secret**. The outsider has to blend in, and the insiders have to find them without giving the word away.

## Rules as implemented

**Board.** Each round deals `boardSize` words (12 or 16) from ONE word group, so the board has a clear category:

- **Packs:** each selected pack is a group, and its name and emoji are the category. Groups come up in a shuffled cycle, so every pack appears once before any repeats, and the same group never plays twice in a row across a reshuffle.
- **Host lists:** each list is its own group, labelled "Host's list" (list names stay on the host). Lists with fewer than 8 words are merged into one group, and the merged group is dropped if it's still under 8.
- **Player-written words:** when players write words (`perPlayer > 0`), every round's board is **"Our words"**. If there aren't enough fresh words to fill the board, a random selected pack or list tops it up and the category becomes "Our words + Animals". With no packs or lists the board is simply smaller. Below 8 words it's topped up from Everyday Things, so the game never gets stuck.
- Past secrets are kept off later boards where the group allows, and the secret is always a fresh word when one exists. The board is shuffled once more after drawing, so a word's position says nothing.

**Roles.** 1 outsider (2 is allowed with 7+ players). Outsiders are picked uniformly at random every round. A "fair rotation" was rejected on purpose: by the last round it would tell everyone who the outsider must be. Two outsiders don't know each other. Everyone taps **Got it** after peeking. The host can start without stragglers.

**Formats**

- **Clues** (default): a fresh random turn order each round, and each player gives ONE word. Online it's typed: a single word, at most 24 characters, not a word on the board (every board word is refused alike, so a refusal says nothing about the secret), and not a repeat. On one device it's said aloud and the device taps **Said it**. Clues show publicly as they arrive. The host can skip a player or call the vote early. Then comes a discussion, with an optional timer (default 90 s, *Off* = the host calls the vote).
- **Questions**: a free-talk timer (2–10 min, default 4). The app picks who asks first. The host can skip the timer and call the vote. Pause/resume works for both timers.

**Vote.** A simultaneous secret ballot, and you can't vote for yourself. A ballot can be changed until the last one is in, and the vote closes the moment everyone has voted (or when the host closes it). The single most-voted player is **accused**. A tie, or no votes, catches nobody and the outsiders win. If the accused is an insider, the outsiders win. If the accused is an outsider, the round goes to their **last chance**: they pick the secret from the board (or give up). Right means the outsiders steal the win. Wrong means the insiders win. With 2 outsiders, catching either one counts.

**Early guess.** Any time after the peek and before the vote, an outsider can press **I know the word!** and pick one. Right: the outsiders win at once. Wrong: the insiders win. A guess up to 1.5 s after the vote opened still counts (it races the buzzer). Any ballots are then discarded.

**Scoring.** Outsiders win: +2 to each outsider, +1 more to the one who named the word. Insiders win: +1 to each insider, +1 more to each insider whose ballot named an outsider. 3–10 rounds (default 5), a reveal screen after each round (result, secret, outsider(s), the guess, who voted for whom, the board, +points and a leaderboard), then the shared final results with a round-by-round history.

## Hidden information

`oddOneOutViewFor` is the only redaction point:

| Field | Who sees it |
|---|---|
| `you.role` | only that seat |
| `secretIndex` | insiders during the round, everyone from the reveal |
| outsiders | nobody until the reveal, except that the accused outsider is public in `lastChance` (that *is* the catch). A second outsider stays hidden |
| ballots | `voted[]` (who has voted) and your own `yourVote` only. `tally` and `accused` appear when the vote closes, per-voter `votes` only at the reveal |
| guesses | resolve the round immediately, so they're only ever seen in the reveal |
| groups, host lists, players' words, `usedSecrets`, RNG | never |

Tests check byte-identical views: a seat's view doesn't change whichever *other* player is the outsider (one and two outsiders, every pre-reveal phase), outsider and spectator views don't change whichever board word is secret, and views don't change whoever the other ballots name. Spectators (`seat = null`) get no role, no secret and no ballots until the reveal.

## Single device

- The shared screen shows the seat-null view. **Peek** is a pass loop: a cover for the next player (or tap a name to go out of order), then their role card and board, then **Got it — hide it**. The seat resets to null before the action is sent.
- **Clues** are spoken in the order shown. The device taps **Said it**.
- **I know the word!** asks who's guessing. An outsider gets the board picker, and an insider gets "you're not an outsider" (so bluffing is possible). The shared board never highlights the secret, even while an insider holds the device.
- **Voting** (option, single device only): *Secret ballots* (default) is a pass loop with a cover per voter. *Open vote* means everyone points and the device taps the accused, or "It's a tie". An open vote records no ballots, so there's no voting bonus.
- The accused outsider picks their last-chance word on the shared screen.

## Options

`words` (default packs: animals, food, places, jobs, sports), `boardSize` 12 | 16, `outsiders` 1 | 2, `format` `'clues'` | `'questions'`, `discussSeconds` 0–300 (under 15 = off), `talkMinutes` 2–10, `rounds` 3–10, `voting` `'secret'` | `'open'`. `optionsProblem` refuses 2 outsiders with fewer than 7 players, no word source, or a players-only source with fewer than 8 words in total.
