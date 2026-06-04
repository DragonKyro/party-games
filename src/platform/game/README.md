# platform/game

Shared game-engine contracts.

- `types.ts` — the `GameModule` contract, `ActionContext`, `ReduceResult`. Every game in `src/games/` implements this.
- `registry.ts` — `GAMES` array. Add a module here to expose it in the picker.
- `rng.ts` — seeded mulberry32 with `rngShuffle`/`rngPick` helpers. Use this from reducers so every peer reproduces the same sequence.

Pure logic only. No React, no DOM, no `platform/net` imports.
