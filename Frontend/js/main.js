import { API } from './api.js';
import { initBoard, setContext } from './board.js';
import { joinMatchmaking } from './matchmaking.js';
import { initChat, setChatContext, handleIncomingChat } from './chat.js';

// Small helper
const $ = (sel) => document.querySelector(sel);

function getTokenFromUI() {
  const el = $('#li-token');
  return (el?.value || '').trim();
}

function restoreToken() {
  const saved = localStorage.getItem('lichess_token') || '';
  const input = $('#li-token');
  const remember = $('#remember-token');
  if (saved && input) {
    input.value = saved;
    if (remember) remember.checked = true;
  }
}

function persistTokenIfChecked() {
  const remember = $('#remember-token');
  const token = getTokenFromUI();
  if (remember?.checked) {
    localStorage.setItem('lichess_token', token);
  } else {
    localStorage.removeItem('lichess_token');
  }
}

async function boot() {
  // init UI pieces that don’t depend on token
  initBoard({
    onSendMove: async ({ uci, gameId, playerToken }) => {
      try {
        await API.makeMove(playerToken, gameId, uci);
      } catch (e) {
        console.warn('move failed', e);
      }
    },
    onTurn: () => {}
  });
  initChat();

  restoreToken();

  const joinBtn = $('#join-matchmaking-btn');
  const status = $('#matchmaking-status');
  const spinner = $('#loading-spinner');

  joinBtn?.addEventListener('click', async () => {
    const token = getTokenFromUI();
    if (!token) {
      alert('Paste your Lichess token first.');
      return;
    }

    persistTokenIfChecked();

    // quick preflight: verify token works
    status.textContent = 'Verifying token…';
    spinner.style.display = '';

    try {
      const acct = await API.getAccount(token); // throws if 401
      const myName = acct.username;

      // Join public pool at 5+0 by default
      status.textContent = 'Joining 5+0 pool…';
      const mm = await joinMatchmaking({
        token,
        rated: false,
        time: 5,
        increment: 0,
        color: 'random'
      });

      const { gameId } = mm;
      status.textContent = 'Match found! Starting stream…';
      spinner.style.display = 'none';

      // Stream game & wire board/chat
      let role = '?';
      API.streamGame(token, gameId, (line) => {
        if (line.type === 'gameFull') {
          const meIsWhite =
            line.white?.name?.toLowerCase?.() === myName.toLowerCase();
          role = meIsWhite ? 'white' : 'black';

          setContext({ gameId, playerId: myName, role, token });
          setChatContext({ token, gameId, playerName: myName });
        }

        if (line.type === 'gameState' && line.moves) {
          const moves = line.moves.trim().split(' ');
          const last = moves[moves.length - 1];
          if (last) window.applyOpponentMoveUCI?.(last);
        }

        handleIncomingChat(line);
      }).catch((e) => console.warn('game stream ended', e));
    } catch (err) {
      spinner.style.display = 'none';
      // Friendly messages for common cases
      const msg =
        err?.code === 401 || String(err).includes('account')
          ? 'Token is invalid or missing the "board:play" scope.'
          : String(err?.message || err) || 'Failed.';
      status.textContent = `Error: ${msg}`;
      console.error(err);
      alert(status.textContent);
    }
  });
}

window.addEventListener('DOMContentLoaded', boot);
