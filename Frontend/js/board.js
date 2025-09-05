// ./js/board.js
// Board + local chess engine. Emits UCI moves compatible with Lichess Board API.
let chess, board, state = {
  gameId: null,
  playerId: null,   // username on lichess
  role: null,       // 'white' | 'black'
  token: null,
  onSendMove: null,
  onTurn: null,
};

// --- PUBLIC API -------------------------------------------------------------

export function initBoard({ onSendMove, onTurn }) {
  state.onSendMove = onSendMove;
  state.onTurn = onTurn;

  chess = new Chess();
  board = Chessboard('board', {
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    draggable: true,
    onDragStart: (_src, piece) => {
      if (!state.role) return false;
      const myTurn = (chess.turn() === 'w' && state.role === 'white') ||
                     (chess.turn() === 'b' && state.role === 'black');
      const isMine = (state.role === 'white' && piece.startsWith('w')) ||
                     (state.role === 'black' && piece.startsWith('b'));
      return myTurn && isMine;
    },
    onDrop: (from, to) => {
      // Try all legal moves from 'from' to 'to' to compute UCI (with promotion)
      const legal = chess.moves({ verbose: true }).filter(m => m.from === from && m.to === to);
      if (!legal.length) return 'snapback';

      // Pick first legal, prefer queen promotion by default
      const move = legal[0];
      const promotion = move.promotion || 'q';
      const uci = move.from + move.to + (move.promotion ? move.promotion : '');

      // Apply locally for instant UX
      chess.move({ from, to, promotion });
      board.position(chess.fen());
      state.onTurn?.();
      state.onSendMove?.({ uci, gameId: state.gameId, playerToken: state.token });
    }
  });

  updateTurnUI();
}

export function setContext({ gameId, playerId, role, token }) {
  state.gameId = gameId;
  state.playerId = playerId;
  state.role = role;
  state.token = token;

  const r = document.getElementById('role'); if (r) r.textContent = role || '?';
  const g = document.getElementById('game-id'); if (g) g.textContent = gameId ?? '—';
  const p = document.getElementById('player-id'); if (p) p.textContent = playerId ?? '—';
}

export function setRole(role) {
  state.role = role;
  const r = document.getElementById('role'); if (r) r.textContent = role || '?';
}

export function resetBoard() {
  chess.reset();
  board.start();
  updateTurnUI();
}

export function applyOpponentMove(san) {
  try { chess.move(san); board.position(chess.fen()); updateTurnUI(); }
  catch { /* ignore */ }
}

// Lichess sends NDJSON events. Call this from main.js for each parsed line.
export function handleGameStreamLine(line) {
  // Full snapshot with initial FEN & who you are
  if (line.type === 'gameFull') {
    // Prefer FEN from line.state if present
    if (line.state?.fen) applyFen(line.state.fen);

    // If 'you' is present, infer role; else leave as-is (main.js can set it)
    try {
      const youId = line.you?.id?.toLowerCase?.();
      const whiteId = line.white?.id?.toLowerCase?.();
      const blackId = line.black?.id?.toLowerCase?.();
      if (youId && (whiteId || blackId)) {
        const role = (youId === whiteId) ? 'white' : (youId === blackId) ? 'black' : state.role;
        setRole(role);
      }
    } catch { /* no-op */ }

    // If moves are present in gameFull.state.moves, we could reconstruct, but FEN is enough.
    updateTurnUI();
    return;
  }

  // Incremental state with FEN and moves list
  if (line.type === 'gameState') {
    if (line.fen) applyFen(line.fen);
    // Optional: you can read line.moves (space-separated UCI) if you want a move list UI
    updateTurnUI();
    return;
  }

  // Optional: Chat relay into your chatbox
  if (line.type === 'chatLine') {
    const messages = document.getElementById('messages');
    if (messages) {
      const div = document.createElement('div');
      div.textContent = `${line.username}: ${line.text}`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    return;
  }
}

// For Lichess streams we sometimes have UCI; keep a UCI applier on window for legacy use
window.applyOpponentMoveUCI = function(uci) {
  const from = uci.slice(0, 2), to = uci.slice(2, 4), promo = uci.slice(4, 5) || undefined;
  const mv = chess.move({ from, to, promotion: promo });
  if (mv) { board.position(chess.fen()); updateTurnUI(); }
};

export function currentTurn() { return chess.turn() === 'w' ? 'White' : 'Black'; }

// --- INTERNAL ---------------------------------------------------------------

function applyFen(fen) {
  if (!fen) return;
  // Only update if changed to avoid unnecessary animations
  if (fen !== chess.fen()) {
    chess.load(fen);
    board.position(chess.fen(), false);
  }
}

function updateTurnUI() {
  const el = document.getElementById('current-turn');
  if (el) {
    const t = currentTurn();
    el.textContent = t;
    el.className = t.toLowerCase();
  }
}
