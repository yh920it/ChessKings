import { API } from './api.js';
import { initBoard, setContext } from './board.js';
import { joinMatchmaking } from './matchmaking.js';
import { initChat, setChatContext, handleIncomingChat } from './chat.js';

async function boot(){
  initBoard({
    onSendMove: async ({ uci, gameId, playerToken }) => {
      try { await API.makeMove(playerToken, gameId, uci); }
      catch(e){ console.warn('move failed', e); }
    },
    onTurn: ()=>{}
  });
  initChat();

  const joinBtn = document.getElementById('join-matchmaking-btn');
  joinBtn.addEventListener('click', async ()=>{
    const token = (document.getElementById('li-token')?.value || '').trim();
    const remember = document.getElementById('remember-token')?.checked;
    if (!token) { alert('Paste a Lichess token with board:play and challenge:write'); return; }
    if (remember) localStorage.setItem('lichessToken', token); else localStorage.removeItem('lichessToken');

    try {
      const { gameId, myName, abortSeek } =
        await joinMatchmaking({ token, rated:false, time:5, increment:0, color:'random' });

      let role = '?';
      API.streamGame(token, gameId, (line)=>{
        if (line.type === 'gameFull'){
          const meIsWhite = line.white?.name?.toLowerCase?.() === myName.toLowerCase();
          role = meIsWhite ? 'white' : 'black';
          setContext({ gameId, playerId: myName, role, token });
          setChatContext({ token, gameId, playerName: myName });
        }
        if (line.type === 'gameState' && line.moves){
          const moves = line.moves.trim().split(' ');
          const last = moves[moves.length - 1];
          if (last) window.applyOpponentMoveUCI?.(last);
        }
        handleIncomingChat(line);
      });
    } catch (e){
      console.error(e);
      alert(e.message || 'Failed to join matchmaking');
    }
  });

  // prefill token if remembered
  const saved = localStorage.getItem('lichessToken');
  if (saved) document.getElementById('li-token').value = saved;
}

window.addEventListener('DOMContentLoaded', boot);
