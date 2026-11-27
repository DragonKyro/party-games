# engine/

Game-agnostic, pure plumbing. No network, store, UI or per-game imports (except the registry, which lists the modules).

- `types.ts` — the `GameModule` contract: `createInitialState`, `applyAction(state, action, ctx)` (`ctx.now` = host clock), `viewFor` (the redaction chokepoint), `isFinished`, `defaultOptions`, optional `optionsProblem`, `nextScheduled` (timers), `liveBoard` (live drawing).
- `registry.ts` — every module by id.
- `rng.ts` — seeded sfc32 RNG. Keep the `RngState` in your private state; `cloneRng` before drawing and store the clone back. `subSeed` for independent streams.
- `timer.ts` — `Timer` as data (`startTimer`, `pauseTimer`, `resumeTimer`, `timeLeft`, `isExpired`, …).
- `teams.ts` — balanced random teams, team-turn rotation, and the shared "pick teams" phase (`TeamsAction`, `teamsReduce`).
- `guards.ts` — `assertHostOnly`, `assertSeat`, `assertInt`.
- `meta.ts` — the `GameMeta` presentation type each game exports.

## Hidden information rule

The host holds the only complete state. Devices receive only what `viewFor(state, seat)` returns for their own seat (spectators: `seat = null`). The seed, the RNG state and the host's saved word lists never appear in a view or the lobby.
