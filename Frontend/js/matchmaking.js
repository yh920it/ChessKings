import { API, delay } from './api.js';

// Join the public lobby using a Lichess seek, then wait for a gameStart event.
export async function joinMatchmaking({ token, rated=false, time=5, increment=0, color='random', timeoutMs=90000 }){
  const status = document.getElementById('matchmaking-status');
  const spinner = document.getElementById('loading-spinner');
  status.textContent = 'Joining Lichess lobby…'; spinner.style.display = '';

  // Who am I?
  const acct = await API.getAccount(token); // { username }
  const myName = acct.username;

  // Listen for events BEFORE creating the seek.
  let resolveStart, rejectStart;
  const mmPromise = new Promise((res, rej)=>{ resolveStart = res; rejectStart = rej; });

  const controller = new AbortController();  // lets us cancel the seek if we time out
  let timedOut = false;

  API.streamEvents(token, evt => {
    if (evt.type === 'gameStart' && evt.game && evt.game.id){
      resolveStart({ gameId: evt.game.id, myName, abortSeek: ()=>controller.abort() });
    }
  }).catch(err=>console.warn('event stream ended', err));

  // Fire the seek (keep the request open)
  let seekResp;
  try {
    seekResp = await API.createSeek(token, { rated, time, increment, color });
  } catch (e) {
    spinner.style.display = 'none';
    status.textContent = 'Idle';
    throw new Error('Seek failed. Check that time/increment are valid (e.g., 5+0) and your token has challenge:write.');
  }

  // Timeout if nobody pairs us in time; abort the seek request
  (async () => {
    await delay(timeoutMs);
    timedOut = true;
    try { controller.abort(); } catch {}
    rejectStart(new Error('No match found within the timeout window.'));
  })();

  // Keep the connection open until we get paired (or timeout)
  try {
    await seekResp.body?.getReader().read(); // hold the connection
  } catch {} // aborted on match or timeout

  const started = await mmPromise;
  if (timedOut) throw new Error('No match found within the timeout window.');

  status.textContent = 'Match found!'; spinner.style.display = 'none';
  return started; // { gameId, myName, abortSeek }
}
