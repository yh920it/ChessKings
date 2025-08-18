import { API, delay } from './api.js';

// Join the public lobby using a Lichess seek, then wait for a gameStart event.
// Defaults to 5+0 and times out if nothing happens soon.
export async function joinMatchmaking({
  token,
  rated = false,
  time = 5,
  increment = 0,
  color = 'random',
  timeoutMs = 90_000 // 90s timeout so you don’t hang forever
}) {
  const status = document.getElementById('matchmaking-status');
  const spinner = document.getElementById('loading-spinner');

  status.textContent = 'Opening event stream…';
  spinner.style.display = '';

  // Start listening BEFORE posting the seek so we don’t miss gameStart
  let resolveMM;
  let rejectMM;
  const mmPromise = new Promise((res, rej) => {
    resolveMM = res;
    rejectMM = rej;
  });

  let timedOut = false;
  const to = setTimeout(() => {
    timedOut = true;
    rejectMM(new Error('No match found within the timeout window.'));
  }, timeoutMs);

  API.streamEvents(token, (evt) => {
    if (evt.type === 'gameStart' && evt.game?.id && !timedOut) {
      clearTimeout(to);
      resolveMM({ gameId: evt.game.id });
    }
  }).catch((err) => {
    // Don’t reject immediately; the seek might still succeed via another stream
    console.warn('Event stream ended', err);
  });

  // Now create the seek
  status.textContent = `Posting seek (${time}+${increment})…`;

  try {
    // Lichess rejects invalid combos with 400. Keep time in [0..180], increment [0..60].
    const t = Number(time);
    const inc = Number(increment);
    if (
      !Number.isFinite(t) ||
      !Number.isFinite(inc) ||
      t < 0 ||
      t > 180 ||
      inc < 0 ||
      inc > 60
    ) {
      throw new Error('Invalid time control values.');
    }

    await API.createSeek(token, {
      rated: !!rated,
      time: t,
      increment: inc,
      color
    });
  } catch (e) {
    clearTimeout(to);
    const msg =
      (e?.server && e.server.error?.global?.[0]) ||
      (e?.server && e.server.global?.[0]) ||
      e?.message ||
      'Seek failed.';
    const friendly =
      /Invalid time control/i.test(msg)
        ? 'Seek failed. Check that time/increment are valid (e.g., 5+0, 3+2).'
        : msg;

    status.textContent = friendly;
    spinner.style.display = 'none';
    throw new Error(friendly);
  }

  status.textContent = 'Waiting for an opponent…';
  return mmPromise.finally(() => {
    spinner.style.display = 'none';
  });
}
