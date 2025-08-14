// Board + local chess engine. Emits UCI moves compatible with Lichess Board API.
let chess, board, state = {
  gameId: null,
  playerId: null,   // username on lichess
  role: null,       // 'white' | 'black'
  token: null,
  onSendMove: null,
  onTurn: null,
};

export function initBoard({ onSendMove, onTurn }){
  state.onSendMove = onSendMove; state.onTurn = onTurn;
  chess = new Chess();
  board = Chessboard('board', {
    position: 'start',
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
    draggable: true,
    onDragStart: (_src, piece) => {
      if (!state.role) return false;
      const myTurn = (chess.turn()==='w' && state.role==='white') || (chess.turn()==='b' && state.role==='black');
      const isMine = (state.role==='white' && piece.startsWith('w')) || (state.role==='black' && piece.startsWith('b'));
      return myTurn && isMine;
    },
    onDrop: (from, to) => {
      // Try all legal moves from 'from' to 'to' to compute UCI (with promotion)
      const legal = chess.moves({ verbose:true }).filter(m => m.from===from && m.to===to);
      if (!legal.length) return 'snapback';
      const move = legal[0];
      const uci = move.from + move.to + (move.promotion ? move.promotion : '');
      // Apply locally for instant UX
      chess.move({ from, to, promotion: move.promotion || 'q' });
      board.position(chess.fen());
      state.onTurn?.();
      state.onSendMove?.({ uci, gameId: state.gameId, playerToken: state.token });
    }
  });
  updateTurnUI();
}

export function setContext({ gameId, playerId, role, token }){
  state.gameId = gameId; state.playerId = playerId; state.role = role; state.token = token;
  const r = document.getElementById('role'); if (r) r.textContent = role || '?';
  const g = document.getElementById('game-id'); if (g) g.textContent = gameId ?? '—';
  const p = document.getElementById('player-id'); if (p) p.textContent = playerId ?? '—';
}

export function resetBoard(){ chess.reset(); board.start(); updateTurnUI(); }

export function applyOpponentMove(san){
  try{ chess.move(san); board.position(chess.fen()); updateTurnUI(); }
  catch{ /* ignore */ }
}

// For Lichess streams we get UCI; expose a UCI applier on window for main.js
window.applyOpponentMoveUCI = function(uci){
  const from = uci.slice(0,2), to = uci.slice(2,4), promo = uci.slice(4,5)||undefined;
  const mv = chess.move({ from, to, promotion: promo });
  if (mv){ board.position(chess.fen()); updateTurnUI(); }
};

export function currentTurn(){ return chess.turn()==='w' ? 'White' : 'Black'; }

function updateTurnUI(){
  const el = document.getElementById('current-turn');
  if (el){ const t = currentTurn(); el.textContent = t; el.className = t.toLowerCase(); }
}