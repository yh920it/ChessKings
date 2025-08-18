// /js/main.js
import { API, saveToken, loadToken } from './api.js';
import { initBoard, setContext } from './board.js';
import { joinMatchmaking } from './matchmaking.js';
import { initChat, setChatContext, handleIncomingChat } from './chat.js';

async function boot(){
  // Init board + chat
  initBoard({
    onSendMove: async ({ uci, gameId, playerToken }) => {
      try { await API.makeMove(playerToken, gameId, uci); }
      catch (e) { console.warn('move failed', e); }
    },
    onTurn: ()=>{}
  });
  initChat();

  // UI elements
  const joinBtn  = document.getElementById('join-matchmaking-btn');
  const statusEl = document.getElementById('matchmaking-status');
  const spinner  = document.getElementById('loading-spinner');
  const tokenEl  = document.getElementById('li-token');
  const remember = document.getElementById('remember-token');

  if (!joinBtn) {
    console.error('Missing #join-matchmaking-btn in DOM.');
    return;
  }

  // Prefill token if saved
  const saved = loadToken();
  if (tokenEl && saved) {
    tokenEl.value = saved;
    if (remember) remember.checked = true;
  }

  joinBtn.addEventListener('click', async () => {
    const token = (tokenEl?.value || '').trim();
    if (!token) {
      alert('Paste a Lichess token with scope "board:play" (and "challenge:write" for seeks).');
      tokenEl?.focus();
      return;
    }

    // Remember token locally for convenience (dev)
    if (!remember || remember.checked) saveToken(token);

    // UX: disable while finding match
    joinBtn.disabled = true;
    statusEl && (statusEl.textContent = 'Joining Lichess lobby…');
    spinner && (spinner.style.display = '');

    try {
      // Default 5|0 unrated, random color
      const { gameId, myName } = await joinMatchmaking({
        token, rated: false, time: 5, increment: 0, color: 'random'
      });

      statusEl && (statusEl.textContent = 'Match found! Starting…');
      spinner && (spinner.style.display = 'none');

      // Stream the game: detect our color, update board & chat, relay chat
      API.streamGame(token, gameId, (line) => {
        if (line.type === 'gameFull') {
          const meIsWhite = line.white?.name?.toLowerCase?.() === myName.toLowerCase();
          const role = meIsWhite ? 'white' : 'black';
          setContext({ gameId, playerId: myName, role, token });
          setChatContext({ token, gameId, playerName: myName });
        }
        if (line.type === 'gameState' && line.moves) {
          const last = line.moves.trim().split(' ').pop();
          if (last) window.applyOpponentMoveUCI?.(last); // board.js should expose this
        }
        handleIncomingChat(line);
      });
    } catch (err) {
      console.error(err);
      statusEl && (statusEl.textContent = 'Failed to join. Check token & scopes.');
      spinner && (spinner.style.display = 'none');
      joinBtn.disabled = false;
    }
  });
}

window.addEventListener('DOMContentLoaded', boot);
