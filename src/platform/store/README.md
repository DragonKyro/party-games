# platform/store

Four Zustand stores.

- `networkStore` — owns the Trystero `RoomBindings`. Manages connection, role (`solo`/`host`/`guest`/`spectator`), peer map, chat, and host-side private log (so late joiners can recover their hidden info). On boot it registers a broadcast sink with `gameStore` so dispatches automatically emit the public action + any `privates`.
- `lobbyStore` — host-authoritative lobby (seats, selected game, per-game settings). Host mutators return the next state so `networkStore` can broadcast it.
- `gameStore` — wraps the active `GameModule`. `dispatch` reduces locally + broadcasts; `applyLocal` reduces silently (used by network receivers). `privateForMe` is the latest private payload addressed to the local peer.
- `uiStore` — global toasts.

`networkStore` is the only store that imports the others; reverse dependencies go through `registerBroadcast` to avoid cycles.
