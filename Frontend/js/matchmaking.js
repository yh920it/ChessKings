// ./js/matchmaking.js
import { API } from './api.js';

// Join the public lobby using a Lichess seek, then wait for a gameStart event.
// Usage: await joinMatchmaking({ token, rated:false, time:5, increment:0, color:'random', timeoutMs:90000 })
export async function joinMatchmaking({
  token,
  rated = false,
  time = 5,          // minutes
  increment = 0,     // seconds
  color = 'random',  // 'random' | 'white' | 'black'
  timeoutMs = 90_000
}) {
  const status  = document.getElementById('matchmaking-status');
  const spinner = document.getElementById('loading-spinner');

  // UI: starting
  status.textContent = 'Joining Lichess lobby…';
  spinner.style.display = '';

  // 0) Verify token & grab username (early fail if scope is wrong)
  const acct = await API.me(token);        // throws if invalid/missing board:play
  const myName = acct.username || 'You';

  // 1) Open the global event stream FIRST so we don't miss gameStart
  let resolveStart, rejectStart;
  const startedP = new Promise((res, rej) => { resolveStart = res; rejectStart = rej; });

  const es = API.openEventStream(token, (evt) => {
    if (evt?.type === 'gameStart' && evt.game?.id) {
      // Found a match
      try { es.close(); } catch {}
      resolveStart({ gameId: evt.game.id, myName });
    }
  });

  // 2) Place the seek (form-encoded minutes + seconds)
  try {
    await API.createSeek(token, { rated, time, increment, color });
  } catch (e) {
    spinner.style.display = 'none';
    status.textContent = 'Idle';
    // Match your old error text, but corrected for board:play
    throw new Error('Seek failed. Check that time/increment are valid (e.g., 5+0) and your token has board:play.');
  }

  // 3) Timeout guard (seeks auto-expire server-side)
  const t = setTimeout(() => {
    try { es.close(); } catch {}
    rejectStart(new Error('No match found within the timeout window.'));
  }, timeoutMs);

  // 4) Wait for gameStart or timeout
  const started = await startedP.finally(() => clearTimeout(t));

  // UI: matched
  status.textContent = 'Match found!';
  spinner.style.display = 'none';

  // Return details to caller
  return started; // { gameId, myName }
}
