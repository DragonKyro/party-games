# store/

Zustand stores, kept narrow:

- **`gameStore`** — the current public view (per-seat redacted), the local seat, and the `dispatch` API UIs call. On the host (single device or online host) it also holds the full private state, applies actions (`hostApply`, passing the server-aligned clock as `ctx.now`) and runs the **scheduler**: after every applied action it asks the module for `nextScheduled(state)` and arms one timeout. It enforces which seats this device may view or act as (`controllableSeats`): online only your own seat; on a single device every seat. `playAgain` restarts with the same players and options.
- **`networkStore`** — online play: connection, role (solo / host / guest / spectator), lobby, chat, presence, errors. Open-table seating (`join` / `leave`), host lobby controls (game, options, remove / reorder players, start, end), debounced host saves, and the live-board wiring (`GameModule.liveBoard` → `board/meta`; ops ↔ `boardStore`).
- **`boardStore`** — the live drawing board (Sketch & Guess): a `BoardModel`, local drawing with batched network sends (retrying while the host's grant lands), remote ops in.
- **`hostLogic.ts`** — pure host-side decisions (seating, inbound-action vetting, per-device view fan-out, change-only resend), unit-tested.
- **`clock.ts`** — `serverNow()`; Firebase's server offset is applied online so every device's countdown agrees.

## Why the handler indirection?

`gameStore` must not import from `net/` or `networkStore`. The network store registers hooks into the game store instead: `broadcastHandler` (guest: forward actions), `hostAppliedListener` (host: publish views), `exitHandler` (what "Exit" means online) and `replayHandler` ("Play again" online restarts the match for the room).
