# draw/

Drawings as data, shared by Sketch & Guess (live) and Doodle Telephone (finished drawings in game state).

- `drawing.ts` — strokes on a fixed 800×600 logical canvas (integer points, palette + size indexes; palette 0 doubles as the eraser); base64-VLQ encoding (`encodeDrawing` / `decodeDrawing`, ≤ 40 KB, validated); Ramer–Douglas–Peucker `simplifyDrawing`; `isBlank`.
- `board.ts` — the live board as an append-only op log (`p` add points to a stroke, `u` undo a stroke, `x` clear), each op with a unique id so echoes and replays apply once. `BoardModel` keeps a `version` (any change) and an `epoch` (something was removed → repaint from scratch).
- `paint.ts` — canvas painting with DPR scaling and midpoint quadratic smoothing; incremental painting of growing strokes.

The React side is `src/ui/shared/draw/DrawPad.tsx` (`DrawPad`, `Sketch`, `useLiveBoard`, `useLocalBoard`).
