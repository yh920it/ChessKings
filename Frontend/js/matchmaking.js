// /js/matchmaking.js
import { API, delay } from './api.js';

// Join the public lobby using a Lichess seek, then wait for a gameStart event.
// Defaults: unrated 5|0, random color.
export async function joinMatchmaking({
  token, rated = false, time = 5, increment = 0, color = 'random', timeoutMs = 60000
} = {}) {
  const statusEl = document.getElementById('matchmaking-status');
  const spinner  = document.getElementById('loading-spinner');
  if (statusEl) statusEl.textContent = 'Joining Lichess lobby…';
  if (spinner)  spinner.style.display = '';

  // 1) Identify our account (needed to set player name later)
  const acct = await API.getAccount(token); // throws with helpful message on failure
  const myName = acct.username;

  // 2) Start listening to account events BEFORE creating the seek
  let resolveMM, rejectMM;
  const mmPromise = new Promise((res, rej) => { resolveMM = res; rejectMM = rej; });

  // Optional timeout so we don’t wait forever if no one pairs
  const to = setTimeout(() => {
    rejectMM(new Error('No match found within the timeout window.'));
  }, timeoutMs);

  // Keep a flag so we only resolve once
  let resolved = false;

  // Stream events (gameStart/gameFinish). We don’t await this; it runs in the background.
  API.streamEvents(token, (evt) => {
    if (evt?.type === 'gameStart' && evt.game?.id && !resolved) {
      resolved = true;
      clearTimeout(to);
      resolveMM({ gameId: evt.game.id, myName });
    }
  }).catch(err => {
    // If the stream fails early and we haven’t resolved yet, fail matchmaking
    if (!resolved) {
      clearTimeout(to);
      rejectMM(new Error(`Event stream error: ${err?.message || err}`));
    }
  });

  // 3) Create the public seek (this actually places you in the Lichess lobby)
  await API.createSeek(token, { rated, time, increment, color });

  // 4) Wait for the gameStart event
  try {
    const started = await mmPromise; // { gameId, myName }
    if (statusEl) statusEl.textContent = 'Match found! Starting…';
    if (spinner)  spinner.style.display = 'none';
    return started;
  } catch (err) {
    if (statusEl) statusEl.textContent = err?.message || 'Matchmaking failed.';
    if (spinner)  spinner.style.display = 'none';
    throw err;
  }
}
