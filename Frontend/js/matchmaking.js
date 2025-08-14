import { API, delay } from './api.js';

// Join the public lobby using a Lichess seek, then wait for a gameStart event.
export async function joinMatchmaking({ token, rated=false, time=5, increment=0, color='random' }){
  const status = document.getElementById('matchmaking-status');
  const spinner = document.getElementById('loading-spinner');
  status.textContent = 'Joining Lichess lobby…'; spinner.style.display = '';

  const acct = await API.getAccount(token); // { username }
  const myName = acct.username;

  // Kick off the event stream BEFORE creating the seek, so we don't miss gameStart
  let resolver;
  const mmPromise = new Promise(res=>resolver=res);
  API.streamEvents(token, evt => {
    if (evt.type === 'gameStart' && evt.game && evt.game.id){
      // We don't get color here reliably; we'll infer it once we stream the game headers
      resolver({ gameId: evt.game.id, myName });
    }
  }).catch(err=>console.warn('event stream ended', err));

  await API.createSeek(token, { rated, time, increment, color });

  const started = await mmPromise;
  status.textContent = 'Match found!'; spinner.style.display = 'none';
  return started; // { gameId, myName }
}