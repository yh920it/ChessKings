// api.js
// Lichess-first API layer for real-time play via official endpoints.
// Token: Personal Access Token with "board:play" (plus "challenge:write" for seeks, "msg:write" for chat).
// Docs: https://lichess.org/api

const LICHESS = 'https://lichess.org';
const TOKEN_KEY = 'lichessToken';

// --- Token helpers -----------------------------------------------------------
export function saveToken(t) { localStorage.setItem(TOKEN_KEY, (t || '').trim()); }
export function loadToken()  { return (localStorage.getItem(TOKEN_KEY) || '').trim(); }

/** Resolve token precedence: explicit arg → localStorage → #li-token input */
function resolveToken(explicit) {
  const t = (explicit || '').trim() || loadToken() ||
            (document.getElementById('li-token')?.value || '').trim();
  return t;
}

function requireToken(explicit) {
  const t = resolveToken(explicit);
  if (!t) throw new Error('No Lichess token. Paste one in the input or save to localStorage.');
  return t;
}

// --- Headers -----------------------------------------------------------------
function jsonHeaders(token)  { return { Authorization: `Bearer ${token}`, Accept: 'application/json' }; }
function ndjsonHeaders(token){ return { Authorization: `Bearer ${token}`, Accept: 'application/x-ndjson' }; }
function formHeaders(token)  { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' }; }

// --- NDJSON reader -----------------------------------------------------------
async function readNDJSON(stream, onLine) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try { onLine(JSON.parse(line)); } catch { /* ignore malformed line */ }
    }
  }
}

// --- API ---------------------------------------------------------------------
export const API = {
  // Identify current account (to detect our color when a game starts)
  getAccount: async (tokenMaybe) => {
    const token = requireToken(tokenMaybe);
    const r = await fetch(`${LICHESS}/api/account`, {
      headers: jsonHeaders(token),
      credentials: 'omit'
    });
    if (!r.ok) {
      const body = await r.text().catch(()=> '');
      throw new Error(`account ${r.status} – ${body.slice(0,200) || 'no body'}`);
    }
    return r.json();
  },

  // Stream account events (challenges, gameStart, gameFinish)
  streamEvents: async (tokenMaybe, onEvent) => {
    const token = requireToken(tokenMaybe);
    const r = await fetch(`${LICHESS}/api/stream/event`, { headers: ndjsonHeaders(token) });
    if (!r.ok) {
      const body = await r.text().catch(()=> '');
      throw new Error(`stream events ${r.status} – ${body.slice(0,200) || 'no body'}`);
    }
    return readNDJSON(r.body, onEvent);
  },

  // Create a public seek (matchmaking in the lichess lobby)
  // opts: rated:boolean, time:int, increment:int, variant:string ('standard'), color:'random'|'white'|'black'
  createSeek: async (tokenMaybe, opts = {}) => {
    const token = requireToken(tokenMaybe);
    const params = new URLSearchParams({
      rated: String(!!opts.rated),
      time: String(opts.time ?? 5),          // default 5 minutes
      increment: String(opts.increment ?? 0),// default 0 increment
      variant: opts.variant ?? 'standard',
      color: opts.color ?? 'random'
    });
    const r = await fetch(`${LICHESS}/api/board/seek`, {
      method: 'POST',
      headers: formHeaders(token),
      body: params
    });
    if (!r.ok) {
      const body = await r.text().catch(()=> '');
      throw new Error(`seek ${r.status} – ${body.slice(0,200) || 'no body'}`);
    }
    return true;
  },

  // Stream a game (real-time moves, chat lines, clocks)
  streamGame: async (tokenMaybe, gameId, onLine) => {
    const token = requireToken(tokenMaybe);
    const r = await fetch(`${LICHESS}/api/board/game/stream/${gameId}`, { headers: ndjsonHeaders(token) });
    if (!r.ok) {
      const body = await r.text().catch(()=> '');
      throw new Error(`stream game ${r.status} – ${body.slice(0,200) || 'no body'}`);
    }
    return readNDJSON(r.body, onLine);
  },

  // Make a move (UCI like 'e2e4' or 'e7e8q')
  makeMove: async (tokenMaybe, gameId, uci) => {
    const token = requireToken(tokenMaybe);
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/move/${uci}`, {
      method: 'POST',
      headers: jsonHeaders(token)
    });
    if (!r.ok) {
      const body = await r.text().catch(()=> '');
      throw new Error(`move ${r.status} – ${body.slice(0,200) || 'no body'}`);
    }
    return r.json().catch(() => ({ ok: true }));
  },

  // Send game chat (room: 'player' or 'spectator')
  postChat: async (tokenMaybe, gameId, text, room = 'player') => {
    const token = requireToken(tokenMaybe);
    const body = new URLSearchParams({ room, text });
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/chat`, {
      method: 'POST',
      headers: formHeaders(token),
      body
    });
    if (!r.ok) {
      const resp = await r.text().catch(()=> '');
      throw new Error(`chat ${r.status} – ${resp.slice(0,200) || 'no body'}`);
    }
    return true;
  }
};

export const delay = (ms) => new Promise(res => setTimeout(res, ms));
