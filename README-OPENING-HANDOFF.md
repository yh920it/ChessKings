# ChessKings Phase 9 — Opening Academy Handoff

## Added

- A **Continue in Game Study** button appears after an Opening Academy lesson is completed.
- The completed UCI move sequence, user side, opening, variation, ECO, and lesson ID are stored temporarily in `sessionStorage`.
- `gamestudy.html` reconstructs the lesson with Chess.js instead of relying on an approximated FEN.
- The complete opening line is shown in the Game Study move history.
- Game Study opens in Guided Play from the final lesson position.
- Stockfish automatically continues when the engine-controlled side is to move.
- The handoff payload is removed after it is consumed.

## Required file placement

- `chesskings.html` and `gamestudy.html` must be in the same directory.
- Opening Academy uses `JS/chesskings.js` and `CSS/chesskings.css`.
- Game Study uses its existing Game Study JavaScript, CSS, data, and engine files.
- Both pages must be served from the same origin so `sessionStorage` is shared.
