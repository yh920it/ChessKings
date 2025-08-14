// Lichess-first API layer for real-time play via official endpoints.
// Requires a Lichess OAuth token with scope: "board:play" (and optional "challenge:write" for seeks; 
// chat uses board scope). Docs: https://lichess.org/api

const LICHESS = 'https://lichess.org';

const jsonHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/json'
});

const ndjsonHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Accept': 'application/x-ndjson'
});

const formHeaders = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/x-www-form-urlencoded'
});

// Utility: read NDJSON stream line-by-line
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
      try { onLine(JSON.parse(line)); } catch { /* ignore */ }
    }
  }
}

export const API = {
  // Identify current account (to detect our color when a game starts)
  getAccount: async (token) => {
    const r = await fetch(`${LICHESS}/api/account`, { headers: jsonHeaders(token), credentials: 'omit' });
    if (!r.ok) throw new Error('account');
    return r.json();
  },
  // Stream account events (challenges, gameStart, gameFinish)
  streamEvents: async (token, onEvent) => {
    const r = await fetch(`${LICHESS}/api/stream/event`, { headers: ndjsonHeaders(token) });
    if (!r.ok) throw new Error('stream events');
    return readNDJSON(r.body, onEvent);
  },
  // Create a public seek (matchmaking in the lichess lobby)
  // opts: rated:boolean, time:int, increment:int, variant:string ('standard'), color:'random'|'white'|'black'
  createSeek: async (token, opts={}) => {
    const params = new URLSearchParams({
      rated: String(!!opts.rated), time: String(opts.time ?? 5), increment: String(opts.increment ?? 0),
      variant: opts.variant ?? 'standard', color: opts.color ?? 'random'
    });
    const r = await fetch(`${LICHESS}/api/board/seek`, { method:'POST', headers: formHeaders(token), body: params });
    if (!r.ok) throw new Error('seek');
    return true;
  },
  // Stream a game (real-time moves, chat lines, clocks)
  streamGame: async (token, gameId, onLine) => {
    const r = await fetch(`${LICHESS}/api/board/game/stream/${gameId}`, { headers: ndjsonHeaders(token) });
    if (!r.ok) throw new Error('stream game');
    return readNDJSON(r.body, onLine);
  },
  // Make a move (UCI like 'e2e4' or 'e7e8q')
  makeMove: async (token, gameId, uci) => {
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/move/${uci}`, { method:'POST', headers: jsonHeaders(token) });
    if (!r.ok) throw new Error('move');
    return r.json().catch(()=>({ ok:true }));
  },
  // Send game chat (room: 'player' or 'spectator')
  postChat: async (token, gameId, text, room='player') => {
    const body = new URLSearchParams({ room, text });
    const r = await fetch(`${LICHESS}/api/board/game/${gameId}/chat`, { method:'POST', headers: formHeaders(token), body });
    if (!r.ok) throw new Error('chat');
    return true;
  }
};

export const delay = (ms) => new Promise(res=>setTimeout(res, ms));