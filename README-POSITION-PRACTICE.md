# ChessKings Game Study — Position Practice Phase

This build activates Position Practice using `Data/study-positions.json`.

## Included

- Four practice categories: opening, middlegame, tactical, and endgame
- Sixteen starter positions
- Position title, prompt, difficulty, side, and source metadata
- Category filtering
- Previous, retry, and next position controls
- Automatic board orientation based on the required side
- Hidden Stockfish benchmark before the attempt
- One move per attempt
- Existing engine-backed move grading after the attempt
- Preferred move, best reply, evaluation change, and principal variations
- Stale-search protection when switching positions or categories
- Invalid or missing practice-data handling

## Required file structure

- `gamestudy.html`
- `CSS/chesskings.css`
- `CSS/gamestudy.css`
- `JS/gamestudy.js`
- `JS/stockfish-manager.js`
- `Data/study-positions.json`
- `Engine/stockfish-18-lite-single.js`
- `Engine/stockfish-18-lite-single.wasm`

Run the site through GitHub Pages or another HTTP/HTTPS server. Both `fetch()` and the Stockfish Web Worker may fail from a `file://` URL.

## Adding more positions

Add objects to the `positions` array with these fields:

```json
{
  "id": "unique-position-id",
  "title": "Position title",
  "category": "opening",
  "difficulty": "Intermediate",
  "side": "w",
  "fen": "valid FEN",
  "prompt": "Find the strongest move.",
  "source": "Curated Position"
}
```

Valid categories are `opening`, `middlegame`, `tactical`, and `endgame`. The `side` value must match the side to move in the FEN.
