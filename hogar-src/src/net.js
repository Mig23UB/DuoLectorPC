// Conexión entre los dos: un canal de Supabase Realtime (el mismo servicio que
// ya usa DuoLector y que funciona en Rusia). Sólo pasan mensajes en vivo:
// posiciones, lo que escriben y las fotos de los marcos. Nada se guarda en el
// servidor. El nombre del canal es un hash del código, no el código.
import { createClient } from '@supabase/supabase-js';

let sb = null;
function client() {
  if (!sb) sb = createClient(__SB_URL__, __SB_KEY__, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } });
  return sb;
}

export async function roomId(code) {
  const data = new TextEncoder().encode('duolector-hogar:' + code.trim().toUpperCase());
  const h = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(h)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

const WORDS = ['LUNA', 'SOL', 'MAR', 'NUBE', 'ROSA', 'TÉ', 'PAN', 'MIEL', 'FARO', 'LAGO', 'OLA', 'PINO', 'NIDO', 'ARCO', 'VELA', 'ZORRO', 'OSO', 'LIMA', 'COCO', 'KIWI'];
export function newCode() {
  const r = crypto.getRandomValues(new Uint32Array(3));
  const w = (n) => WORDS[n % WORDS.length].normalize('NFD').replace(/[̀-ͯ]/g, '');
  return `${w(r[0])}-${String(1000 + (r[1] % 9000))}-${w(r[2] >>> 8)}-${String(10 + (r[2] % 90))}`;
}

// Canal de prueba entre pestañas del mismo navegador (sólo con ?local=1).
class LocalChannel {
  constructor(name, key) {
    this.bc = new BroadcastChannel(name); this.key = key; this.hs = []; this.state = {}; this.me = null;
    this.bc.onmessage = (e) => this.onMsg(e.data);
  }
  on(type, filter, fn) { this.hs.push({ type, ev: filter.event, fn }); return this; }
  emit(type, ev, arg) { this.hs.filter(h => h.type === type && h.ev === ev).forEach(h => h.fn(arg)); }
  onMsg(m) {
    if (m.k === 'join' || m.k === 'here') { this.state[m.key] = [m.meta]; this.emit('presence', 'sync'); if (m.k === 'join' && this.me) this.bc.postMessage({ k: 'here', key: this.key, meta: this.me }); }
    else if (m.k === 'bye') { delete this.state[m.key]; this.emit('presence', 'sync'); }
    else if (m.k === 'b') this.emit('broadcast', m.event, { payload: m.payload });
  }
  subscribe(cb) { setTimeout(() => cb('SUBSCRIBED'), 50); return this; }
  async track(meta) { this.me = meta; this.state[this.key] = [meta]; this.bc.postMessage({ k: 'join', key: this.key, meta }); this.emit('presence', 'sync'); }
  untrack() { this.bc.postMessage({ k: 'bye', key: this.key }); }
  presenceState() { return this.state; }
  send({ event, payload }) { this.bc.postMessage({ k: 'b', event, payload }); }
}

export class Net {
  constructor(room, me, handlers) {
    this.room = room; this.me = me; this.h = handlers; this.peers = new Map(); this.inbox = new Map();
    this.local = new URLSearchParams(location.search).has('local');
    this.ch = this.local ? new LocalChannel('hogar:' + room, me.id)
      : client().channel('hogar:' + room, { config: { presence: { key: me.id }, broadcast: { self: false, ack: false } } });
    const ch = this.ch;
    ch.on('presence', { event: 'sync' }, () => this.onPresence());
    ch.on('broadcast', { event: 'st' }, ({ payload }) => this.h.state && this.h.state(payload));
    ch.on('broadcast', { event: 'say' }, ({ payload }) => this.h.say && this.h.say(payload));
    ch.on('broadcast', { event: 'bot' }, ({ payload }) => this.h.robot && this.h.robot(payload));
    ch.on('broadcast', { event: 'pet' }, ({ payload }) => this.h.pet && this.h.pet(payload));
    ch.on('broadcast', { event: 'hello' }, ({ payload }) => this.h.hello && this.h.hello(payload));
    ch.on('broadcast', { event: 'pman' }, ({ payload }) => this.h.manifest && this.h.manifest(payload));
    ch.on('broadcast', { event: 'pchunk' }, ({ payload }) => this.onChunk(payload));
    ch.on('broadcast', { event: 'pdel' }, ({ payload }) => this.h.photoDel && this.h.photoDel(payload));
    ch.subscribe(async (status) => {
      this.status = status; this.h.status && this.h.status(status);
      if (status === 'SUBSCRIBED') await ch.track({ id: me.id, name: me.name, look: me.look, at: Date.now() });
    });
  }
  onPresence() {
    const st = this.ch.presenceState();
    const list = [];
    for (const k of Object.keys(st)) { const p = st[k][0]; if (p) list.push(p); }
    list.sort((a, b) => a.at - b.at);
    this.h.presence && this.h.presence(list);
  }
  send(event, payload) { if (this.status === 'SUBSCRIBED') this.ch.send({ type: 'broadcast', event, payload: { ...payload, from: this.me.id } }); }
  // fotos: se mandan en pedacitos de 24 KB
  async sendPhoto(slot, dataUrl, ts) {
    const size = 24000, n = Math.ceil(dataUrl.length / size);
    for (let i = 0; i < n; i++) {
      this.send('pchunk', { slot, ts, i, n, d: dataUrl.slice(i * size, (i + 1) * size) });
      await new Promise(r => setTimeout(r, 70));
    }
  }
  onChunk(p) {
    const key = p.slot + ':' + p.ts;
    let e = this.inbox.get(key); if (!e) { e = { parts: new Array(p.n), got: 0 }; this.inbox.set(key, e); }
    if (!e.parts[p.i]) { e.parts[p.i] = p.d; e.got++; }
    if (e.got === p.n) { this.inbox.delete(key); this.h.photo && this.h.photo({ slot: p.slot, ts: p.ts, data: e.parts.join('') }); }
  }
  leave() { try { this.ch.untrack(); if (!this.local) client().removeChannel(this.ch); } catch {} }
}

// Fotos guardadas sólo en este dispositivo (IndexedDB)
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('duolector-hogar', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function photoGet(room) {
  try {
    const d = await db();
    return await new Promise((res) => { const q = d.transaction('photos').objectStore('photos').get(room); q.onsuccess = () => res(q.result || {}); q.onerror = () => res({}); });
  } catch { return {}; }
}
export async function photoPut(room, all) {
  try { const d = await db(); await new Promise((res) => { const tx = d.transaction('photos', 'readwrite'); tx.objectStore('photos').put(all, room); tx.oncomplete = res; tx.onerror = res; }); } catch {}
}
