# words/

The "user-supplied words" heart of every game.

- `index.ts` — the built-in packs (`WORD_PACKS`, `PACK_LIST`), each with a name, emoji, blurb, `fit` (`draw` / `act` / `describe`) and an `adultsOnly` flag. Content lives in `packs/*.ts` (17 packs, ~120–160 entries each, US English).
- `prompts/rank.ts`, `prompts/spectrums.ts` — Rank It criteria ("most … least") and Tune In spectrums (`[left, right]`), each with an 18+ extra list.
- `source.ts` — `WordSource` (`packs` + `listIds` + `perPlayer`) and `PromptSource` (`builtIn` + `spicy` + `listIds` + `perPlayer`): readers for untrusted options, `buildPool` / `buildPromptPool` (merge + dedupe, remembering who wrote each entry), size estimates, problems, summaries.
- `collect.ts` — the shared "everyone writes words" phase: state, actions (`collect.submit` / `collect.reopen` / `collect.close`), reducer, redacted view. Kinds: `words`, or `pairs` ("Left | Right").
- `match.ts` — forgiving typed-guess checking (`isCorrectGuess`, `isCloseGuess`, `containsAnswer`) and hint masks.
- `library.ts` — the host's saved lists in localStorage. **Impure; UI and launchers only.** Options reference lists by id; `resolveLists` turns them into entries on the host at match start (`GameConfig.lists`), so list contents never sit in the world-readable lobby.

`content.test.ts` validates every pack and prompt list (sizes, lengths, duplicates).
