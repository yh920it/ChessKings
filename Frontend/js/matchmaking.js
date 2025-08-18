// matchmaking.js
import { API } from './api.js';

/**
 * Join the Lichess public pool with a seek, then wait for a gameStart event.
 *
 * @param {Object} opts
 * @param {string} opts.token          Lichess OAuth token (must include board:play; challenge:write not required for seeks)
 * @param {boolean} [opts.rated=false] Rated or casual
 * @param {number|string} [opts.time=5]  Minutes for the clock (must be integer >= 0)
 * @param {number|string} [opts.increment=0] Increment in seconds (must be integer >= 0)
 * @param {'random'|'white'|'black'} [opts.color='random']
 * @param {'standard'} [opts.variant='standard']
 * @param {number} [opts.timeoutMs=45000] How long to wait for a pairing before giving up
 */
export async function joinMatchmaking({
  token,
  rated = false,
  time = 5,
  increment = 0,
  color = 'random',
  variant = 'standard',
  timeoutMs = 45000
}) {
  const statusEl  = document.getElementById('matchmaking-status');
  const spinnerEl = document.getElementById('loading-spinner');
  if (statusEl)  statusEl.textContent = 'Checking account…';
  if (spinnerEl) spinnerEl.style.display = '';

  // --- 0) Sanity-check token early, surface 401 nicely
  let acct;
  try {
    acct = await API.getAccount(token); // { username }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Unauthorized: bad or missing token';
    if (spinnerEl) spinnerEl.style.display = 'none';
    // Re-throw a richer error to surface in console too
    throw new Error('Lichess auth failed (401). Paste a valid token with the "board:play" scope.');
  }
  const myName = acct.username;

  // --- 1) Normalize and validate time control (prevents 400 Invalid time control)
  const minutes   = Number.isFinite(+time) ? Math.max(0, Math.trunc(+time)) : 5;
  const inc       = Number.isFinite(+increment) ? Math.max(0, Math.trunc(+increment)) : 0;
  if (minutes === 0 && inc === 0) {
    // Lichess pool disallows 0+0; default to 5+0
    console.warn('Requested 0+0 is not allowed in the pool; defaulting to 5+0');
  }
  const tcMinutes = (minutes === 0 && inc === 0) ? 5 : minutes;
  const tcInc     = (minutes === 0 && inc === 0) ? 0 : inc;

  // --- 2) Start listening to account events BEFORE creating the seek
  let resolveGame;
  let rejectGame;
  const foundGame = new Promise((res, rej) => { resolveGame = res; rejectGame = rej; });

  let eventStreamClosed = false;
  API.streamEvents(token, (evt) => {
    if (evt?.type === 'gameStart' && evt?.game?.id) {
      if (statusEl) statusEl.textContent = 'Match found!';
      resolveGame({ gameId: evt.game.id, myName });
    }
  }).catch((err) => {
    eventStreamClosed = true;
    // Only complain if we haven’t already resolved/aborted
    if (statusEl && !statusEl.textContent.includes('Match found')) {
      console.warn('Event stream ended:', err);
    }
  });

  // --- 3) Create the seek (may throw 400s etc.)
  if (statusEl) statusEl.textContent = `Joining Lichess lobby… (${tcMinutes}+${tcInc})`;
  try {
    await API.createSeek(token, {
      rated,
      time: tcMinutes,
      increment: tcInc,
      color,
      variant
    });
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Failed to create seek';
    if (spinnerEl) spinnerEl.style.display = 'none';
    // Give extra context if it was the known 400 case we saw
    throw new Error('Seek failed. Check that time/increment are valid (e.g., 5+0, 3+2).');
  }

  // --- 4) Race: wait for gameStart or timeout
  if (statusEl) statusEl.textContent = 'Waiting to be paired…';
  const timeout = new Promise((_, rej) =>
    setTimeout(() => rej(new Error('No match found within the timeout window.')), timeoutMs)
  );

  try {
    const res = await Promise.race([foundGame, timeout]);
    if (spinnerEl) spinnerEl.style.display = 'none';
    return res; // { gameId, myName }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'No match found. Try again.';
    if (spinnerEl) spinnerEl.style.display = 'none';
    // Note: We didn’t store the seek ID to cancel; it will expire on its own shortly.
    // If you want to actively cancel, extend API.createSeek to capture the Location header’s seek id and add an API.cancelSeek.
    throw err;
  } finally {
    // If the stream is still open, the fetch reader will naturally end when the page navigates or GC’d.
    // No action needed here beyond letting the caller decide to retry.
    if (!eventStreamClosed) {
      // optional: nothing; we didn’t keep a controller handle for abort to keep code simple
    }
  }
}
