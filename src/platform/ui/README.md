# platform/ui

Shared React surface — everything that isn't game-specific.

- `HomeMenu.tsx` — landing page. Display name input + host/join + game picker preview.
- `LobbyScreen.tsx` — seat list, game picker, per-game `SettingsPanel` slot, start button, chat.
- `GameShell.tsx` — chrome around the active game module's `GameScreen` + chat sidebar.
- `chat/` — shared chat panel (broadcast over Trystero, plus system messages).
- `shared/` — `Button`, `TextField`, `RoomCode`, `PlayerList`. Use these; don't restyle from scratch in games.
- `theme.css` — CSS variables. Override at `:root` if a game needs a different palette.

Games render through `module.GameScreen`. They can drop their own subcomponents into `src/games/<id>/` but should reach for `shared/` first.
