# ChessKings Game Study — Stockfish Phase

This build adds browser-based Stockfish 18 Lite analysis to **Free Analysis** mode.

## Included

- Automatic analysis of the active Free Analysis position
- White-perspective evaluation
- Best move
- Three candidate moves through MultiPV
- Principal variations converted from UCI to SAN
- Search-depth display
- Mate-score display
- Per-position analysis caching
- Cancellation and stale-result protection when navigating or changing positions
- Manual Analyze and Stop controls

## Required hosting

Open the project through GitHub Pages or another HTTP/HTTPS server. Do not open `gamestudy.html` directly through a `file://` path because Web Workers and WebAssembly require normal web hosting.

## File structure

- `gamestudy.html`
- `CSS/chesskings.css`
- `CSS/gamestudy.css`
- `JS/gamestudy.js`
- `JS/stockfish-manager.js`
- `Engine/stockfish-18-lite-single.js`
- `Engine/stockfish-18-lite-single.wasm`
- `Engine/STOCKFISH-LICENSE.txt`

## Current boundary

Stockfish analysis is enabled only in Free Analysis. Guided Play, Guess the Best Move, and Position Practice remain prepared for their later engine workflows.

## Guided Play phase

Guided Play now uses Stockfish automatically:

- The user controls the selected side.
- When it is the opposing side's turn, the board locks while Stockfish searches to depth 16.
- Stockfish's `bestmove` is applied automatically and stored as an engine-created study node.
- Starting as Black causes Stockfish to make White's opening move automatically.
- Existing child lines are preserved; the engine does not recalculate a position that already has a continuation.
- Navigation or mode changes invalidate pending replies so stale engine moves cannot be applied to another position.

Move grading and before/after evaluation comparison are intentionally not part of this phase.

## Move grading phase

Guided Play now analyzes the position before each user move and the resulting position after it. The feedback panel shows the move classification, White-perspective evaluations before and after, evaluation loss, Stockfish's preferred move, the best reply, and both calculated lines. Automatically generated prose is intentionally limited to direct move facts such as captures, checks, castling, promotions, and the engine's best reply.

Initial centipawn-loss thresholds:

- Best: 0.00–0.10 or the engine's preferred move
- Excellent: 0.11–0.30
- Good: 0.31–0.60
- Inaccuracy: 0.61–1.00
- Mistake: 1.01–2.00
- Blunder: above 2.00
- Forced: only one legal move

Mate-state changes override the ordinary thresholds where applicable.


## Guess the Best Move phase

Guess the Best Move is now active:

- Stockfish silently analyzes the starting position before the attempt.
- No evaluation, preferred move, or principal variation is shown before the user moves.
- The user receives one attempt from the active position.
- The resulting move is analyzed with the existing grading pipeline.
- The engine panel then reveals the preferred move, evaluation, depth, and principal variation.
- The Move Feedback panel shows the rating, evaluation loss, best reply, both lines, and verified move facts.
- The board locks after the attempt until Retry Position or New Study is selected.
- Retry Position returns to the exact challenge position without discarding the stored engine benchmark.
