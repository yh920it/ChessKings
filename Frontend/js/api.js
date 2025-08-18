const LICHESS = 'https://lichess.org';

const jsonHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/json'
});
const ndjsonHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/x-ndjson'
});
// Seek returns a long‑lived text stream; form-encoded body
const formHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'text/plain'
});

async function readNDJSON(stream, onLine){
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for(;;){
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream:true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try { onLine(JSON.parse(line)); } catch {}
    }
  }
}

async function readErrorBody(r) {
  const text = await r.text().catch(()=> '');
  try { return JSON.parse(text); } catch { return text; }
}

export const API = {
  getAccount: async (token) => {
    const r = await fetch(`${LICHESS}/api/account`, { headers: jsonHeaders(token), credentials: 'omit' });
    if (!r.ok) throw new Error(`account ${r.status}`);
    return r.json();
  },

  streamEvents: async (token, onEvent) => {
    const r = await fetch(`${LICHESS}/api/stream/event`, { headers: ndjsonHeaders(token) });
    if (!r.ok) throw new Error(`stream events ${r.status}`);
    return readNDJSON(r.body, onEvent);
  },

  // Realtime lobby seek. time & increment are MINUTES (ints).
  createSeek: async (token, { rated=false, time=5, increment=0, variant='standard', color='random', ratingRange } = {}) => {
    const t = Number.isFinite(time) ? Math.max(1, Math.floor(time)) : NaN;
    const inc = Number.isFinite(increment) ? Math.max(0, Math.floor(increment)) : NaN;
    if (!Number.isFinite(t) || !Number.isFinite(inc)) {
      throw new Error('Invalid time control: time/increment must be integers (minutes).');
    }
    const params = new URLSearchParams({
      rated: String(!!rated),
      time: String(t),
      increment: String(inc),
      variant,
      color
    });
    if (ratingRange) params.set('ratingRange', ratingRange); // e.g. "1200-1800"
    const r = await fetch(`${LICHESS}/api/board/seek`, {
      method:'POST', headers: formHeaders(token), body: params
    });
    if (!r.ok) {
      const body = await readErrorBody(r);
      throw new Error(`seek ${r.status} – ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }
    // IMPORTANT: Keep the connection open. We don't read the body; Lichess holds it until matched or cancelled.
    return r; // caller may abort() to cancel the seek
  },

  streamGame: async (token, gameId, onLine) => {
    const r = await fetch(`${LICHESS}/api/board/game/stream/${gameId}`, { headers: ndjsonHeaders(token) });
    if (!r.ok) throw new Error(`stream game ${r.status}`);
    return readNDJSON(r.body, onLine);
  },

  makeMove: async (token, gameId, uci) => {
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/move/${uci}`, { method:'POST', headers: jsonHeaders(token) });
    if (!r.ok) {
      const body = await readErrorBody(r);
      throw new Error(`move ${r.status} – ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    }
    return r.json().catch(()=>({ ok:true }));
  },

  postChat: async (token, gameId, text, room='player') => {
    const body = new URLSearchParams({ room, text });
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/chat`, { method:'POST', headers: formHeaders(token), body });
    if (!r.ok) {
      const eb = await readErrorBody(r);
      throw new Error(`chat ${r.status} – ${typeof eb === 'string' ? eb : JSON.stringify(eb)}`);
    }
    return true;
  }
};

export const delay = (ms) => new Promise(res=>setTimeout(res, ms));
