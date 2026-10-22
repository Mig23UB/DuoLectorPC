import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildRoom, ROOM, SEATS, SOFA_FRONT } from './room.js';
import { Avatar, preload, HAIRS, HAIR_COLORS, SHIRTS, PANTS, DEFAULT_LOOK } from './avatar.js';
import { Robot } from './robot.js';
import { Net, roomId, newCode, photoGet, photoPut } from './net.js';
import { t, lang, setLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STORE = 'duolector.hogar.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } })();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch {} };
if (!saved.id) { saved.id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2); save(); }
saved.look = { ...DEFAULT_LOOK, ...(saved.look || {}) };

// Desde la cuenta de DuoLector llega #k=<clave de la pareja>&n=<nombre>
const hash = new URLSearchParams(location.hash.slice(1));
const accountKey = hash.get('k');
if (hash.get('n') && !saved.name) saved.name = hash.get('n').slice(0, 24);

function applyTexts() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('[data-tp]').forEach(el => el.placeholder = t(el.dataset.tp));
  $('lang').value = lang;
}
applyTexts();

// ── Escena ──────────────────────────────────────────────────────────────
const canvas = $('scene');
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .55;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, .1, 60);
camera.position.set(4.6, 4.3, 6.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(.2, .9, -.4);
controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
controls.minDistance = 2.2; controls.maxDistance = 15;
controls.minPolarAngle = .5; controls.maxPolarAngle = 1.32;
controls.minAzimuthAngle = -.25; controls.maxAzimuthAngle = 1.25;

const hemi = new THREE.HemisphereLight('#dcecff', '#a07850', 1); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.position.set(1.5, 5, -7); sun.target.position.set(.2, 0, .5); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .02;
const fill = new THREE.DirectionalLight('#ffe9cf', .5); fill.position.set(6, 6, 6); scene.add(fill);

const room = buildRoom(scene);
room.walkable = (x, z, pad = .28) => {
  if (x < ROOM.minX + pad || x > ROOM.maxX - .2 || z < ROOM.minZ + pad || z > ROOM.maxZ - .2) return false;
  for (const o of room.obstacles) if (x > o.minX - pad * .6 && x < o.maxX + pad * .6 && z > o.minZ - pad * .6 && z < o.maxZ + pad * .6) return false;
  return true;
};

// Camino: A* sobre una grilla de 10 cm, después se quitan los puntos innecesarios.
room.plan = (from, to) => {
  const S = .1, W = Math.round((ROOM.maxX - ROOM.minX) / S), H = Math.round((ROOM.maxZ - ROOM.minZ) / S);
  const cx = (x) => Math.max(0, Math.min(W - 1, Math.round((x - ROOM.minX) / S))), cz = (z) => Math.max(0, Math.min(H - 1, Math.round((z - ROOM.minZ) / S)));
  const wx = (i) => ROOM.minX + i * S, wz = (j) => ROOM.minZ + j * S;
  if (!room._grid) { room._grid = new Uint8Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) room._grid[j * W + i] = room.walkable(wx(i), wz(j)) ? 1 : 0; }
  const G = room._grid, sI = cx(from.x), sJ = cz(from.z), gI = cx(to.x), gJ = cz(to.z);
  const los = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / .05); for (let k = 1; k <= n; k++) { const t2 = k / n; if (!room.walkable(a.x + (b.x - a.x) * t2, a.z + (b.z - a.z) * t2, .26)) return false; } return true; };
  if (los(from, to)) return [to.clone()];
  const start = sJ * W + sI, goal = gJ * W + gI;
  const gS = new Float32Array(W * H).fill(1e9), came = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
  const open = [[0, start]]; gS[start] = 0;
  const hh = (k) => Math.hypot((k % W) - gI, Math.floor(k / W) - gJ);
  let found = false, guard = 0;
  while (open.length && guard++ < 20000) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, k] = open.splice(bi, 1)[0]; if (closed[k]) continue; closed[k] = 1;
    if (k === goal) { found = true; break; }
    const i = k % W, j = Math.floor(k / W);
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni; if (closed[nk] || (!G[nk] && nk !== goal)) continue;
      const ng = gS[k] + Math.hypot(di, dj); if (ng < gS[nk]) { gS[nk] = ng; came[nk] = k; open.push([ng + hh(nk), nk]); }
    }
  }
  if (!found) return [to.clone()];
  const pts = []; for (let k = goal; k !== -1 && k !== start; k = came[k]) pts.push(new THREE.Vector3(wx(k % W), 0, wz(Math.floor(k / W))));
  pts.reverse(); pts[pts.length - 1] = to.clone();
  const out = []; let a = from.clone();
  for (let q = 0; q < pts.length; q++) { const nx = pts[q + 1]; if (!nx || !los(a, nx)) { out.push(pts[q]); a = pts[q]; } }
  return out;
};

// Día y noche: según la hora del lugar donde estás, o lo que elijas.
const hour = new Date().getHours();
let nightGoal = saved.mode === 'night' ? 1 : saved.mode === 'day' ? 0 : (hour >= 19 || hour < 7 ? 1 : 0);
let nightAmt = nightGoal;
const bgDay = new THREE.Color('#f3e9dc'), bgNight = new THREE.Color('#0b1030');
scene.background = new THREE.Color();
function applyLight(n) {
  scene.background.copy(bgDay).lerp(bgNight, n);
  hemi.color.set('#dcecff').lerp(new THREE.Color('#5a68a8'), n); hemi.groundColor.set('#a07850').lerp(new THREE.Color('#1a1428'), n);
  hemi.intensity = 1.05 - n * .8;
  sun.color.set('#fff1d6').lerp(new THREE.Color('#9fb4ff'), n); sun.intensity = 2.4 - n * 2.05;
  fill.intensity = .5 - n * .42;
  scene.environmentIntensity = .55 - n * .4;
  room.night.window.uniforms.uNight.value = n;
  room.night.lamps.forEach(l => { l.light.intensity = l.max * n; if (l.mat) l.mat.emissiveIntensity = n * 1.4; });
  room.night.glows.forEach(m => m.emissiveIntensity = n * 2.5);
  renderer.toneMappingExposure = 1.05 + n * .15;
  document.body.classList.toggle('night', n > .5);
}
function setMode(m) {
  nightGoal = m === 'night' ? 1 : 0; saved.mode = m; save();
  $('btnDay').setAttribute('aria-pressed', String(m === 'day')); $('btnNight').setAttribute('aria-pressed', String(m === 'night'));
}
$('btnDay').onclick = () => setMode('day'); $('btnNight').onclick = () => setMode('night');
$('btnDay').setAttribute('aria-pressed', String(!nightGoal)); $('btnNight').setAttribute('aria-pressed', String(!!nightGoal));
applyLight(nightAmt);

// ── Gente, Lumi, etiquetas ──────────────────────────────────────────────
const robot = new Robot(scene);
let me = null; const others = new Map();
const labels = $('labels');
function makeTag(cls) { const d = document.createElement('div'); d.className = cls; labels.appendChild(d); return d; }
const robotTag = makeTag('tag robot'); robotTag.textContent = t('robotName');
const tags = new Map(); // avatar -> {tag, bubble, until}
function tagFor(av) {
  if (!tags.has(av)) { const tag = makeTag('tag'); tag.textContent = av.name; tags.set(av, { tag, bubble: null, until: 0 }); }
  return tags.get(av);
}
function showBubble(av, text) {
  const e = tagFor(av);
  if (e.bubble) e.bubble.remove();
  e.bubble = makeTag('bubble'); e.bubble.textContent = text;
  const ms = Math.min(9000, 2600 + text.length * 70); e.until = performance.now() + ms; av.say(ms);
}
function removeAvatar(av) { const e = tags.get(av); if (e) { e.tag.remove(); e.bubble && e.bubble.remove(); tags.delete(av); } av.dispose(); }

function toast(msg, ms = 2600) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms); }

// ── Lobby: nombre, aspecto, código ─────────────────────────────────────
let preview = null;
async function refreshPreview() {
  const old = preview;
  preview = new Avatar(scene, saved.look, saved.name || '', true);
  preview.pos.set(.5, 0, .7); preview.rot = 0;
  await preview.ready;
  if (old) old.dispose();
}
function pressed(row, attr, val) { row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === String(val)))); }
function buildLobby() {
  const L = saved.look;
  $('name').value = saved.name || '';
  pressed($('gRow'), 'g', L.g); pressed($('skinRow'), 'skin', L.skin);
  const hr = $('hairRow'); hr.querySelectorAll('button').forEach(b => b.remove());
  HAIRS[L.g].forEach((h, i) => { const b = document.createElement('button'); b.dataset.hair = i; b.textContent = String(i + 1); hr.appendChild(b); });
  if (L.g === 'male') { const b = document.createElement('button'); b.dataset.hair = 'beard'; b.textContent = '🧔'; b.setAttribute('aria-pressed', String(!!L.beard)); hr.appendChild(b); }
  hr.querySelectorAll('button[data-hair]').forEach(b => { if (b.dataset.hair !== 'beard') b.setAttribute('aria-pressed', String(+b.dataset.hair === L.hair % HAIRS[L.g].length)); });
  const sw = (rowId, list, key) => {
    const r = $(rowId); r.querySelectorAll('button').forEach(b => b.remove());
    list.forEach((c, i) => { const b = document.createElement('button'); b.style.background = c; b.dataset.i = i; b.setAttribute('aria-label', c); b.setAttribute('aria-pressed', String(L[key] === i)); r.appendChild(b); });
  };
  sw('hairCRow', HAIR_COLORS, 'hairC'); sw('shirtRow', SHIRTS, 'shirt'); sw('pantsRow', PANTS, 'pants');
}
function lobbyEvents() {
  const L = saved.look;
  const changed = () => { save(); buildLobby(); refreshPreview(); };
  $('gRow').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; L.g = b.dataset.g; L.hair = 0; L.beard = false; changed(); };
  $('skinRow').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; L.skin = b.dataset.skin; changed(); };
  $('hairRow').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.hair === 'beard') L.beard = !L.beard; else L.hair = +b.dataset.hair; changed(); };
  [['hairCRow', 'hairC'], ['shirtRow', 'shirt'], ['pantsRow', 'pants']].forEach(([id, k]) => $(id).onclick = (e) => { const b = e.target.closest('button'); if (!b) return; L[k] = +b.dataset.i; changed(); });
  $('name').oninput = () => { saved.name = $('name').value.trim().slice(0, 24); save(); };
  $('btnCreate').onclick = () => { const c = newCode(); enter(c, true); };
  $('btnJoin').onclick = () => {
    const c = $('codeIn').value.trim().toUpperCase().replace(/\s+/g, '-');
    if (!/^[A-Z]+-\d{4}-[A-Z]+(-\d{2})?$/.test(c)) { toast(t('badCode')); return; }
    enter(c, false);
  };
  $('codeIn').onkeydown = (e) => { if (e.key === 'Enter') $('btnJoin').click(); };
  $('btnEnterAcc').onclick = () => enter('ACC:' + accountKey, false);
}

// ── Entrar al hogar ─────────────────────────────────────────────────────
let net = null, roomKey = null, photos = {}, hostId = null, peerList = [];
async function enter(code, isNew) {
  if (!saved.name) { saved.name = lang === 'ru' ? 'Я' : lang === 'en' ? 'Me' : 'Yo'; }
  save();
  const isAcc = code.startsWith('ACC:');
  if (!isAcc) { saved.code = code; save(); }
  $('lobby').hidden = true; document.body.classList.remove('in-lobby'); camMode = 'room'; placeCamera();
  if (preview) { preview.dispose(); preview = null; }
  me = new Avatar(scene, saved.look, saved.name, true); me.planner = room.plan;
  me.pos.set(-.6 + Math.random() * .3, 0, 1.4); me.rot = Math.PI * .9;
  await me.ready; tagFor(me);
  roomKey = await roomId(code);
  photos = await photoGet(roomKey); Object.entries(photos).forEach(([s, p]) => setFrame(+s, p && p.data));
  if (!isAcc) { $('codeChip').hidden = false; $('codeChip').textContent = code; $('codeChip').onclick = () => showCode(code); }
  if (isNew) showCode(code);
  connect();
  setTimeout(() => $('help').classList.add('gone'), 9000);
}
function showCode(code) { $('codeShow').textContent = code; $('codeBox').hidden = false; }
$('btnCodeClose').onclick = () => $('codeBox').hidden = true;
$('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('codeShow').textContent); $('btnCopy').textContent = t('copied'); setTimeout(() => $('btnCopy').textContent = t('copy'), 1500); } catch {} };

function connect() {
  net = new Net(roomKey, { id: saved.id, name: saved.name, look: saved.look }, {
    status: (s) => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { $('presence').hidden = false; $('presence').textContent = t('offline'); } },
    presence: (list) => {
      peerList = list;
      const mine = list.findIndex(p => p.id === saved.id);
      if (mine >= 2) { toast(t('full'), 6000); net.leave(); return; }
      const allowed = list.slice(0, 2);
      hostId = allowed[0] ? allowed[0].id : saved.id;
      // aparecen o se van
      for (const p of allowed) {
        if (p.id === saved.id || others.has(p.id)) continue;
        const av = new Avatar(scene, p.look, p.name, false); av.planner = room.plan; av.pos.set(-1, 0, 2.2); others.set(p.id, av);
        av.ready.then(() => tagFor(av));
        toast(`${p.name} ${t('joined')}`);
        sendState(); net.send('pman', { m: manifest() });
      }
      for (const [id, av] of [...others]) if (!allowed.find(p => p.id === id)) { toast(`${av.name} ${t('left')}`); removeAvatar(av); others.delete(id); }
      const pr = $('presence'); pr.hidden = false;
      pr.textContent = others.size ? `${saved.name} & ${[...others.values()][0].name} · ${t('together')}` : t('alone');
    },
    state: (p) => { const av = others.get(p.from); if (av) av.ready.then(() => av.applyRemote(p, room)); },
    say: (p) => { const av = others.get(p.from); if (av) showBubble(av, String(p.text || '').slice(0, 140)); },
    robot: (p) => { if (p.from !== saved.id && hostId !== saved.id) robot.applyRemote(p); },
    pet: () => robot.pet(),
    manifest: (p) => {
      const theirs = p.m || {};
      for (const [s, ph] of Object.entries(photos)) {
        if (!ph) continue;
        if (!theirs[s] || theirs[s] < ph.ts) { if (ph.data) net.sendPhoto(+s, ph.data, ph.ts); else net.send('pdel', { slot: +s, ts: ph.ts }); }
      }
    },
    photo: (p) => { const cur = photos[p.slot]; if (!cur || cur.ts < p.ts) { photos[p.slot] = { ts: p.ts, data: p.data }; photoPut(roomKey, photos); setFrame(p.slot, p.data); } },
    photoDel: (p) => { const cur = photos[p.slot]; if (!cur || cur.ts < p.ts) { photos[p.slot] = { ts: p.ts, data: null }; photoPut(roomKey, photos); setFrame(p.slot, null); } },
  });
}
function manifest() { const m = {}; for (const [s, p] of Object.entries(photos)) if (p) m[s] = p.ts; return m; }
let lastSent = '';
function sendState(force) {
  if (!net || !me) return;
  const s = me.snapshot(); const k = JSON.stringify(s);
  if (force || k !== lastSent) { lastSent = k; net.send('st', s); }
}
setInterval(() => sendState(true), 2500);

// ── Marcos de fotos ─────────────────────────────────────────────────────
const texLoader = new THREE.TextureLoader();
function setFrame(i, dataUrl) {
  const f = room.frames[i]; if (!f) return;
  if (!dataUrl) { f.photo.material.map = null; f.photo.material.color.set('#d9d2c7'); f.photo.material.needsUpdate = true; f.plus.visible = true; return; }
  texLoader.load(dataUrl, (tx) => {
    tx.colorSpace = THREE.SRGBColorSpace;
    const ar = tx.image.width / tx.image.height, fa = f.w / f.h;
    tx.repeat.set(ar > fa ? fa / ar : 1, ar > fa ? 1 : ar / fa); tx.offset.set((1 - tx.repeat.x) / 2, (1 - tx.repeat.y) / 2);
    f.photo.material.map = tx; f.photo.material.color.set('#ffffff'); f.photo.material.needsUpdate = true; f.plus.visible = false;
  });
}
let photoSlot = -1;
function openPhoto(i) { photoSlot = i; $('photoBox').hidden = false; $('btnPhotoDel').hidden = !(photos[i] && photos[i].data); }
$('btnPhotoClose').onclick = () => $('photoBox').hidden = true;
$('photoIn').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const img = await createImageBitmap(file).catch(() => null); if (!img) { toast(t('badPhoto')); return; }
  const max = 900, sc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', .82), ts = Date.now();
  photos[photoSlot] = { ts, data }; await photoPut(roomKey, photos); setFrame(photoSlot, data);
  $('photoBox').hidden = true;
  if (net) net.sendPhoto(photoSlot, data, ts);
};
$('btnPhotoDel').onclick = async () => {
  const ts = Date.now(); photos[photoSlot] = { ts, data: null }; await photoPut(roomKey, photos); setFrame(photoSlot, null);
  $('photoBox').hidden = true; if (net) net.send('pdel', { slot: photoSlot, ts });
};

// ── Tocar la escena ─────────────────────────────────────────────────────
const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down || !me || !me.mixer) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const dt = performance.now() - down.t; down = null;
  if (moved > 8 || dt > 600) return;
  ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects([...room.clickables, ...robot.meshes()], false);
  const h = hits[0]; if (!h) return;
  const kind = h.object.userData.kind;
  if (kind === 'robot') { robot.pet(); net && net.send('pet', {}); return; }
  if (kind === 'frame') { openPhoto(h.object.userData.slot); return; }
  if (kind === 'sofa') { sit(); return; }
  if (kind === 'floor') {
    let { x, z } = h.point;
    if (!room.walkable(x, z)) { // acercarse lo más posible
      for (let r = .1; r < 1.2; r += .1) { let ok = false; for (let a = 0; a < 6.28; a += .5) { if (room.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) { x += Math.cos(a) * r; z += Math.sin(a) * r; ok = true; break; } } if (ok) break; }
    }
    me.walkTo(x, z); sendState();
  }
});
function freeSeat() {
  const taken = new Set([...others.values()].filter(a => a.state === 'sit' || a.state === 'sitting').map(a => a.seat));
  const order = [0, 1].sort((a, b) => Math.hypot(SEATS[a].x - me.pos.x, SEATS[a].z - me.pos.z) - Math.hypot(SEATS[b].x - me.pos.x, SEATS[b].z - me.pos.z));
  return order.find(i => !taken.has(i));
}
function sit() {
  if (me.state === 'sit' || me.state === 'sitting') { me.standUp(() => sendState()); sendState(); return; }
  const i = freeSeat(); if (i == null) return;
  me.sitAt(i, SEATS[i], SOFA_FRONT(i)); sendState();
}
$('btnSit').onclick = () => me && sit();
$('btnWave').onclick = () => { if (!me) return; me.doEmote(me.state === 'sit' ? 'Interact' : 'Celebration'); sendState(); };
$('btnDance').onclick = () => { if (!me) return; if (me.emote === 'Dance_Loop') { me.emote = null; } else me.dance(); sendState(); };
$('chat').onsubmit = (e) => {
  e.preventDefault(); const v = $('chatIn').value.trim(); if (!v || !me) return;
  $('chatIn').value = ''; showBubble(me, v); net && net.send('say', { text: v });
};
$('lang').onchange = () => { setLang($('lang').value); applyTexts(); robotTag.textContent = t('robotName'); if (!$('lobby').hidden) buildLobby(); };

// ── Bucle ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock(); const tmp = new THREE.Vector3();
function place(el, v, dy = 0) {
  tmp.copy(v); tmp.y += dy; tmp.project(camera);
  if (tmp.z > 1) { el.style.display = 'none'; return; }
  el.style.display = ''; el.style.left = ((tmp.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - tmp.y) / 2 * innerHeight) + 'px';
}
let botSend = 0, thinkT = 0, lastMeState = '';
function loop() {
  const dt = Math.min(clock.getDelta(), .05);
  nightAmt += (nightGoal - nightAmt) * Math.min(1, dt * 2.2);
  if (Math.abs(nightGoal - nightAmt) > .001) applyLight(nightAmt);
  room.night.window.uniforms.uTime.value += dt;
  if (me) { me.update(dt, room); if (me.state + me.seat + (me.emote || '') !== lastMeState) { lastMeState = me.state + me.seat + (me.emote || ''); sendState(); } }
  if (preview) preview.update(dt, room);
  for (const av of others.values()) av.update(dt, room);
  // Lumi: lo maneja quien entró primero; la otra persona sólo lo ve
  const amHost = !net || hostId === saved.id;
  if (amHost) {
    thinkT -= dt;
    if (thinkT <= 0) { thinkT = .6; const ppl = [me, ...others.values()].filter(Boolean); if (ppl.length) robot.think(ppl, room); }
    botSend -= dt; if (net && others.size && botSend <= 0) { botSend = .3; net.send('bot', robot.snapshot()); }
  }
  robot.update(dt, room, nightAmt);
  controls.update();
  renderer.render(scene, camera);
  // etiquetas
  for (const [av, e] of tags) {
    if (!av.root || !av.mixer) continue;
    av.headWorld(tmp); const head = tmp.clone();
    place(e.tag, head, .12);
    if (e.bubble) { if (performance.now() > e.until) { e.bubble.remove(); e.bubble = null; } else place(e.bubble, head, .16); }
  }
  place(robotTag, robot.root.position, .95);
  requestAnimationFrame(loop);
}
let camMode = 'lobby';
function placeCamera() {
  const portrait = innerWidth < innerHeight;
  camera.clearViewOffset();
  if (camMode === 'lobby') {
    // cerca de tu persona; el panel ocupa la izquierda (compu) o abajo (celular)
    camera.fov = portrait ? 40 : 34;
    controls.target.set(.5, portrait ? .95 : 1.0, .7); camera.position.set(1.0, portrait ? 1.6 : 1.45, portrait ? 6.4 : 3.9);
    if (!portrait && innerWidth >= 900) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * .18, 0, innerWidth, innerHeight);
    if (portrait) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * .3, innerWidth, innerHeight);
  } else {
    camera.fov = portrait ? 50 : 42;
    controls.target.set(.2, portrait ? .6 : .9, -.3);
    if (portrait) camera.position.set(5.2, 7.6, 9.8); else camera.position.set(4.6, 4.3, 6.6);
  }
  controls.update(); camera.updateProjectionMatrix();
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; renderer.setSize(innerWidth, innerHeight, false); placeCamera(); });
dispatchEvent(new Event('resize'));
addEventListener('beforeunload', () => net && net.leave());

// ── Arranque ────────────────────────────────────────────────────────────
(async () => {
  await preload().catch(() => {});
  loop();
  $('loading').classList.add('gone');
  if (accountKey) {
    $('back').href = '/';
    $('accountNote').hidden = false; $('codeArea').hidden = true; $('btnEnterAcc').hidden = false;
  }
  document.body.classList.add('in-lobby');
  buildLobby(); lobbyEvents(); refreshPreview();
  $('lobby').hidden = false;
})();
// para pruebas automáticas
window.__hogar = { camera, controls, robot, room, openPhoto, get me() { return me; }, get preview() { return preview; }, get others() { return others; } };
