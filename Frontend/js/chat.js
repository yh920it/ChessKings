import { API } from './api.js';

let chatState = { token:null, gameId:null, playerName:null };

export function initChat(){
  document.getElementById('chat-send').addEventListener('click', sendChat);
  document.getElementById('chat-text').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });
}

export function setChatContext({ token, gameId, playerName }){
  chatState = { token, gameId, playerName };
}

function pushMsg({ author, text }){
  const div = document.createElement('div');
  div.className = 'message';
  div.textContent = `${author}: ${text}`;
  const m = document.getElementById('messages');
  m.appendChild(div); m.scrollTop = m.scrollHeight;
}

export async function handleIncomingChat(line){
  if (line.type === 'chatLine' && line.room === 'player'){
    pushMsg({ author: line.username || 'Opponent', text: line.text });
  }
}

async function sendChat(){
  const box = document.getElementById('chat-text');
  const text = box.value.trim(); if(!text) return; box.value='';
  pushMsg({ author: 'You', text });
  try{ await API.postChat(chatState.token, chatState.gameId, text, 'player'); }
  catch(e){ console.warn('chat send failed', e); }
}