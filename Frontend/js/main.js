// ./js/main.js
import { API } from './api.js';
import { initBoard, setContext, handleGameStreamLine } from './board.js';
import { joinMatchmaking } from './matchmaking.js';
import { initChat, setChatContext, handleIncomingChat } from './chat.js';

async function boot() {
  // Init board + chat
  initBoard({
    onSendMove: async ({ uci, gameId, playerToken }) => {
      try {
        // NOTE: renamed makeMove -> move in api.js
        await API.move(playerToken, gameId, uci);
      } catch (e) {
        console.warn('move failed', e);
      }
    },
    onTurn: () => {}
  });
  initChat();

  // Prefill token if remembered
  const saved = localStorage.getItem('lichessToken');
  if (saved) {
    const tokEl = document.getElementById('li-token');
    if (tokEl) tokEl.value = saved;
  }

  // Wire Play button
  const joinBtn = document.getElementById('join-matchmaking-btn');
  joinBtn.addEventListener('click', async () => {
    const token = (document.getElementById('li-token')?.value || '').trim();
    const remember = document.getElementById('remember-token')?.checked;
    if (!token) {
      alert('Paste a Lichess token with the board:play scope');
      return;
    }
    if (remember) localStorage.setItem('lichessToken', token);
    else localStorage.removeItem('lichessToken');

    try {
      // Join lobby (opens SSE for global events internally and waits for gameStart)
      const { gameId, myName } = await joinMatchmaking({
        token,
        rated: false,
        time: 5,
        increment: 0,
        color: 'random'
      });

      // Provisional UI context; role will be set once gameFull arrives
      setContext({ gameId, playerId: myName, role: '?', token });
      setChatContext({ token, gameId, playerName: myName });

      // Stream this specific game; forward lines to board + chat
      API.streamGame(token, gameId, (line) => {
        // Let board.js handle gameFull/gameState/chatLine updates & role inference
        handleGameStreamLine(line);

        // Your chat module can still handle any chat lines it expects
        handleIncomingChat(line);

        // (Optional) If you still want last-move UCI playback on top of FEN updates:
        if (line.type === 'gameState' && line.moves) {
          const moves = line.moves.trim().split(' ');
          const last = moves[moves.length - 1];
          if (last) window.applyOpponentMoveUCI?.(last);
        }
      });
    } catch (e) {
      console.error(e);
      alert(e.message || 'Failed to join matchmaking');
    }
  });
}

window.addEventListener('DOMContentLoaded', boot);
