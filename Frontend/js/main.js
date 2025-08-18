import { API } from './api.js';
import { initBoard, setContext, resetBoard, applyOpponentMove } from './board.js';
import { joinMatchmaking } from './matchmaking.js';
import { initChat, setChatContext, handleIncomingChat } from './chat.js';

// === Configure your Lichess token here (or inject via server-side templating) ===
const HARDCODED_TOKEN = "lip_GNDHCVOFfan4uzYKir2F";
const TOKEN = HARDCODED_TOKEN.trim();

function uciFromSAN(chess, san){
  return san;
}

async function boot(){
  initBoard({
    onSendMove: async ({ uci, gameId, playerToken }) => {
      try { await API.makeMove(playerToken, gameId, uci); }
      catch(e){ console.warn('move failed', e); }
    },
    onTurn: ()=>{}
  });
  initChat();

  // Token field & button wiring (simple demo)
  const joinBtn = document.getElementById('join-matchmaking-btn');

  joinBtn.addEventListener('click', async ()=>{
    const token = TOKEN;

    const mm = await joinMatchmaking({ token, rated:false, time:5, increment:0, color:'random' });
    const { gameId, myName } = mm;

    // Start streaming game to infer roles and receive updates
    let role = '?';
    API.streamGame(token, gameId, (line)=>{
      if (line.type === 'gameFull'){
        // Determine our color by comparing usernames
        const meIsWhite = line.white?.name?.toLowerCase?.() === myName.toLowerCase();
        role = meIsWhite ? 'white' : 'black';
        setContext({ gameId, playerId: myName, role, token });
        setChatContext({ token, gameId, playerName: myName });
      }
      if (line.type === 'gameState' && line.moves){
        // Apply only the last move we haven't seen yet
        const moves = line.moves.trim().split(' ');
        const last = moves[moves.length - 1];
        // chessboard update happens in board.js through applyOpponentMove( SAN ), but here we only have UCI.
        // We'll call applyOpponentMoveUCI (added below in board.js) instead.
        if (last) window.applyOpponentMoveUCI?.(last);
      }
      // Chat relay
      handleIncomingChat(line);
    });
  });
}

window.addEventListener('DOMContentLoaded', ()=>{
  // simple hidden input to carry token locally (replace with real auth in production)
  const div = document.createElement('div');
  div.style.display = 'none';
  div.innerHTML = `<input id="lichess-token" type="password" placeholder="Lichess OAuth token"/>`;
  document.body.appendChild(div);
  boot();
});

