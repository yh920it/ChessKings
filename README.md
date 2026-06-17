# ChessKings Complete Build

This package contains the Opening Academy and repaired Game Study page.

Run it through HTTP/HTTPS (GitHub Pages, `python -m http.server`, etc.). Do not open the HTML through `file://`.

## Structure
- `chesskings.html` — Opening Academy
- `gamestudy.html` — Game Study
- `CSS/` — page styles
- `JS/` — Academy, Game Study, and Stockfish manager
- `Data/` — openings, defenses, and practice positions
- `Engine/` — Stockfish 18 Lite single-thread browser build and license

## Game Study modes
- Guided Play
- Guess the Best Move
- Free Analysis
- Position Practice

The repaired build includes synchronized Position Practice markup, engine cancellation, terminal move grading, FEN-aware move numbering, active-branch navigation, Academy handoff, and hardened Stockfish worker handling.
