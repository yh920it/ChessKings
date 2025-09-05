// ./js/api.js
export const API = {
  // Check token & get account
  me: async (token) => {
    const r = await fetch('https://lichess.org/api/account', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) throw new Error('Token invalid or missing board:play');
    return r.json();
  },

  // Stream global events; watch for { type: "gameStart", game: { id } }
  openEventStream: (token, onLine) => {
    // EventSource can't set headers; Lichess allows ?authorization=Bearer+<token>
    const es = new EventSource(
      `https://lichess.org/api/stream/event?authorization=${encodeURIComponent(`Bearer ${token}`)}`
    );
    es.onmessage = (e) => onLine?.(JSON.parse(e.data));
    es.onerror   = (e) => console.error('Event stream error', e);
    return es;
  },

  // Create lobby seek (form-encoded, minutes + seconds)
  createSeek: async (token, { rated=false, time=5, increment=0, color='random', variant='standard' } = {}) => {
    const body = new URLSearchParams({
      rated: rated ? 'true' : 'false',
      time: String(time),           // minutes
      increment: String(increment), // seconds
      color,                        // 'random' | 'white' | 'black'
      variant                       // 'standard', etc.
    });
    const r = await fetch('https://lichess.org/api/board/seek', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/plain'
      },
      body
    });
    if (!r.ok) {
      const text = await r.text().catch(()=> '');
      throw new Error(`Seek failed (${r.status}). ${text || 'Check board:play scope and time/increment.'}`);
    }
    return true;
  },

  // Stream a specific game (NDJSON over SSE)
  streamGame: (token, gameId, onLine) => {
    const es = new EventSource(
      `https://lichess.org/api/board/game/stream/${gameId}?authorization=${encodeURIComponent(`Bearer ${token}`)}`
    );
    es.onmessage = (e) => onLine?.(JSON.parse(e.data));
    es.onerror   = (e) => console.error('Game stream error', e);
    return es;
  },

  // Make a move with UCI (e.g., "e2e4", "g7g8q")
  move: async (token, gameId, uci, opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.offeringDraw) qs.set('offeringDraw', 'true');
    const r = await fetch(`https://lichess.org/api/board/game/${gameId}/move/${uci}?${qs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Accept': 'application/json' }
    });
    if (!r.ok) {
      const text = await r.text().catch(()=> '');
      throw new Error(`Move rejected (${r.status}). ${text}`);
    }
    return r.json();
  },

  // Optional helpers
  resign: (token, gameId) =>
    fetch(`https://lichess.org/api/board/game/${gameId}/resign`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}),
  abort: (token, gameId) =>
    fetch(`https://lichess.org/api/board/game/${gameId}/abort`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }}),
  draw: (token, gameId, yes) =>
    fetch(`https://lichess.org/api/board/game/${gameId}/draw/${yes ? 'yes' : 'no'}`, { method:'POST', headers:{ Authorization:`Bearer ${token}` }})
};
