// Personas: modelos CC0 de Quaternius (Universal Base Characters) con las
// animaciones de su Universal Animation Library. Los modelos vienen sin ropa,
// así que la remera, el pantalón y las zapatillas se pintan en el shader según
// a qué hueso pertenece cada parte del cuerpo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const BASE = import.meta.env.BASE_URL + 'models/';
const loader = new GLTFLoader();
const cache = new Map();
const load = (f) => { if (!cache.has(f)) cache.set(f, loader.loadAsync(BASE + f)); return cache.get(f); };
const texCache = new Map();
const loadTex = (f) => {
  if (!texCache.has(f)) texCache.set(f, new THREE.TextureLoader().loadAsync(BASE + f).then(t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; return t; }));
  return texCache.get(f);
};

export const HAIRS = {
  female: ['hair_long', 'hair_buns', 'hair_simpleparted', 'hair_buzzedfemale'],
  male: ['hair_simpleparted', 'hair_buzzed', 'hair_long', 'hair_buns'],
};
export const HAIR_COLORS = ['#2b1d14', '#5a3a22', '#a8743f', '#d9b06b', '#7a2e1f', '#1c1c1c'];
export const SHIRTS = ['#518bdb', '#36bab8', '#ed6d68', '#e5a057', '#bf89cd', '#f4efe6', '#2f3b52', '#6b8f5e'];
export const PANTS = ['#2f3b52', '#3d4f7a', '#5a4632', '#1f1f24', '#8a8f99', '#e9e2d4'];
export const DEFAULT_LOOK = { g: 'female', skin: 'light', hair: 0, hairC: 1, shirt: 0, pants: 0 };

// Qué es ropa según el hueso: 1 = remera, 2 = pantalón, 3 = zapatillas
function regionOf(name) {
  if (/^(spine_0[123]|clavicle_|upperarm_)/.test(name)) return 1;
  if (/^(pelvis|thigh_|calf_)/.test(name)) return 2;
  if (/^(foot_|ball_)/.test(name)) return 3;
  return 0;
}

function clothesMaterial(baseMat, skeleton, look) {
  const m = baseMat.clone();
  const n = skeleton.bones.length;
  const cols = [], masks = [];
  const shirt = new THREE.Color(SHIRTS[look.shirt] || SHIRTS[0]);
  const pants = new THREE.Color(PANTS[look.pants] || PANTS[0]);
  const shoes = new THREE.Color('#f2f2f2');
  for (let i = 0; i < 80; i++) {
    const r = i < n ? regionOf(skeleton.bones[i].name) : 0;
    const c = r === 1 ? shirt : r === 2 ? pants : r === 3 ? shoes : new THREE.Color(0, 0, 0);
    cols.push(new THREE.Vector4(c.r, c.g, c.b, r ? 1 : 0));
    masks.push(r);
  }
  m.userData.cloth = { value: cols };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCloth = m.userData.cloth;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uCloth[80];\nvarying vec4 vCloth;\nvarying float vY;')
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        vCloth = uCloth[int(skinIndex.x)] * skinWeight.x + uCloth[int(skinIndex.y)] * skinWeight.y
               + uCloth[int(skinIndex.z)] * skinWeight.z + uCloth[int(skinIndex.w)] * skinWeight.w;
        vY = position.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vCloth;\nvarying float vY;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float cm = smoothstep(.35, .7, vCloth.a);
        vec3 cc = vCloth.rgb / max(vCloth.a, .001);
        // trama suave de tela para que no parezca pintura plana
        float weave = .92 + .08 * sin(vY * 900.) * sin(gl_FragCoord.x * .7);
        diffuseColor.rgb = mix(diffuseColor.rgb, cc * weave, cm);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .92, smoothstep(.35,.7,vCloth.a));`);
  };
  m.customProgramCacheKey = () => 'cloth';
  return m;
}

// Capa de tela: copia las partes del cuerpo que cubre la ropa, las infla un poco
// y las suaviza (para que la tela no copie la anatomía) y usa los mismos huesos.
function clothShell(body, kind, offset, smoothIters, color, rough) {
  const g = body.geometry;
  const pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = body.skeleton.bones, inv = body.skeleton.boneInverses;
  const n = pos.count;
  // posición de cada hueso en la pose de reposo
  const B = {}; bones.forEach((b, i) => { B[b.name] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inv[i]).invert()); });
  const has = (k) => !!B[k];
  if (!has('pelvis') || !has('upperarm_l')) return null;
  const want = kind === 'shirt'
    ? /^(spine_0[123]|clavicle_|upperarm_|pelvis)/
    : /^(pelvis|thigh_|calf_|spine_01)/;
  // cortes rectos: se queda lo que cumple dot(p - c, n) <= 0
  const up = new THREE.Vector3(0, 1, 0), down = new THREE.Vector3(0, -1, 0);
  const planes = [];
  if (kind === 'shirt') {
    planes.push({ c: B.pelvis.clone().add(new THREE.Vector3(0, .07, 0)), n: down, side: '' });
    for (const sd of ['l', 'r']) {
      const s0 = B['upperarm_' + sd], e0 = B['lowerarm_' + sd]; if (!s0 || !e0) continue;
      const dir = e0.clone().sub(s0).normalize();
      planes.push({ c: s0.clone().lerp(e0, .85), n: dir, side: sd });
    }
  } else {
    planes.push({ c: B.pelvis.clone().add(new THREE.Vector3(0, .1, 0)), n: up, side: '' });
    for (const sd of ['l', 'r']) {
      const s0 = B['calf_' + sd], e0 = B['foot_' + sd]; if (!s0 || !e0) continue;
      const dir = e0.clone().sub(s0).normalize();
      planes.push({ c: s0.clone().lerp(e0, .93), n: dir, side: sd });
    }
  }
  const w = new Float32Array(n), side = new Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    let a = 0, best = 0, bn = '';
    for (let k = 0; k < 4; k++) {
      const bb = bones[si.getComponent(i, k)], ww = sw.getComponent(i, k);
      if (bb && want.test(bb.name)) a += ww;
      if (ww > best && bb) { best = ww; bn = bb.name; }
    }
    w[i] = want.test(bn) ? 1 : Math.min(a, .5); side[i] = /_l$/.test(bn) ? 'l' : /_r$/.test(bn) ? 'r' : '';
  }
  const applies = (p, x, sd) => !(p.side && sd && p.side !== sd) && !(p.maxX && Math.abs(x) > p.maxX);
  const inside = (x, y, z, sd) => planes.every(p => !applies(p, x, sd) || ((x - p.c.x) * p.n.x + (y - p.c.y) * p.n.y + (z - p.c.z) * p.n.z) <= 0);
  const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const weld = new Map(); const rep = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = key(i); if (!weld.has(k)) weld.set(k, i); rep[i] = weld.get(k); }
  const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (w[a] + w[b] + w[c] < 1.9) continue;
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3, cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3, cz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    const sd = side[a] || side[b] || side[c];
    if (inside(cx, cy, cz, sd)) tris.push(a, b, c);
  }
  if (!tris.length) return null;
  const used = [...new Set(tris)];
  const map = new Map(used.map((v, i) => [v, i]));
  const P = new Float32Array(used.length * 3), N = new Float32Array(used.length * 3);
  const SI = new Uint16Array(used.length * 4), SW = new Float32Array(used.length * 4);
  used.forEach((vi, i) => {
    v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi));
    // los vértices que quedan del otro lado del corte se apoyan sobre él: borde recto
    for (const p of planes) {
      if (!applies(p, v.x, side[vi])) continue;
      const d = (v.x - p.c.x) * p.n.x + (v.y - p.c.y) * p.n.y + (v.z - p.c.z) * p.n.z;
      if (d > 0) v.addScaledVector(p.n, -d);
    }
    P.set([v.x, v.y, v.z], i * 3); N.set([nor.getX(vi), nor.getY(vi), nor.getZ(vi)], i * 3);
    for (let k = 0; k < 4; k++) { SI[i * 4 + k] = si.getComponent(vi, k); SW[i * 4 + k] = sw.getComponent(vi, k); }
  });
  // vecinos por posición soldada
  const nb = used.map(() => new Set());
  const repLocal = used.map(v => rep[v]);
  const byRep = new Map(); repLocal.forEach((r, i) => { if (!byRep.has(r)) byRep.set(r, []); byRep.get(r).push(i); });
  for (let t = 0; t < tris.length; t += 3) {
    const a = map.get(tris[t]), b = map.get(tris[t + 1]), c = map.get(tris[t + 2]);
    [[a, b], [b, c], [c, a]].forEach(([x, y]) => { nb[x].add(y); nb[y].add(x); });
  }
  // Tela: se suaviza (Laplaciano) y en cada paso no se deja entrar al cuerpo.
  // Así apoya sobre lo que sobresale y tapa los huecos, como una prenda real.
  // bordes (aristas de un solo triángulo): se fijan sobre su línea de corte
  const edgeCount = new Map();
  for (let t = 0; t < tris.length; t += 3) {
    const r3 = [rep[tris[t]], rep[tris[t + 1]], rep[tris[t + 2]]];
    for (let e = 0; e < 3; e++) { const a = r3[e], b = r3[(e + 1) % 3]; const k = a < b ? a + '_' + b : b + '_' + a; edgeCount.set(k, (edgeCount.get(k) || 0) + 1); }
  }
  const isB = new Set(); for (const [k, c] of edgeCount) if (c === 1) k.split('_').forEach(x => isB.add(+x));
  const pin = used.map((vi, i) => {
    if (!isB.has(rep[vi])) return null;
    let best = null, bd = 1e9;
    for (const p of planes) { if (!applies(p, P[i * 3], side[vi])) continue; const d = Math.abs((P[i * 3] - p.c.x) * p.n.x + (P[i * 3 + 1] - p.c.y) * p.n.y + (P[i * 3 + 2] - p.c.z) * p.n.z); if (d < bd) { bd = d; best = p; } }
    return bd < .06 ? best : null;
  });
  const onPlane = (i) => { const p = pin[i]; if (!p) return; const d = (P[i * 3] - p.c.x) * p.n.x + (P[i * 3 + 1] - p.c.y) * p.n.y + (P[i * 3 + 2] - p.c.z) * p.n.z; P[i * 3] -= p.n.x * d; P[i * 3 + 1] -= p.n.y * d; P[i * 3 + 2] -= p.n.z * d; };
  for (let i = 0; i < used.length; i++) onPlane(i);
  const O = Float32Array.from(P);
  for (let i = 0; i < used.length; i++) for (let k = 0; k < 3; k++) P[i * 3 + k] += N[i * 3 + k] * offset;
  const tmp = new Float32Array(P.length);
  const nbAll = used.map((_, i) => { const all = new Set(); for (const j of byRep.get(repLocal[i])) for (const q of nb[j]) all.add(q); return [...all]; });
  for (let it = 0; it < smoothIters; it++) {
    for (let i = 0; i < used.length; i++) {
      const all = nbAll[i];
      if (all.length < 3) { tmp[i * 3] = P[i * 3]; tmp[i * 3 + 1] = P[i * 3 + 1]; tmp[i * 3 + 2] = P[i * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0; for (const q of all) { x += P[q * 3]; y += P[q * 3 + 1]; z += P[q * 3 + 2]; }
      const m = all.length, l = .6;
      tmp[i * 3] = P[i * 3] + (x / m - P[i * 3]) * l; tmp[i * 3 + 1] = P[i * 3 + 1] + (y / m - P[i * 3 + 1]) * l; tmp[i * 3 + 2] = P[i * 3 + 2] + (z / m - P[i * 3 + 2]) * l;
    }
    for (let i = 0; i < used.length; i++) {
      const dx = tmp[i * 3] - O[i * 3], dy = tmp[i * 3 + 1] - O[i * 3 + 1], dz = tmp[i * 3 + 2] - O[i * 3 + 2];
      const d = dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2];
      const minD = offset * .7;
      if (d < minD) { const f = minD - d; tmp[i * 3] += N[i * 3] * f; tmp[i * 3 + 1] += N[i * 3 + 1] * f; tmp[i * 3 + 2] += N[i * 3 + 2] * f; }
    }
    P.set(tmp);
    for (let i = 0; i < used.length; i++) onPlane(i);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(P, 3));
  ng.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  ng.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  ng.setIndex(tris.map(v => map.get(v)));
  ng.computeVertexNormals();
  // normales iguales en las costuras para que no se vean cortes
  const nn = ng.attributes.normal;
  for (const list of byRep.values()) if (list.length > 1) {
    let x = 0, y = 0, z = 0; list.forEach(i => { x += nn.getX(i); y += nn.getY(i); z += nn.getZ(i); });
    const L = Math.hypot(x, y, z) || 1; list.forEach(i => nn.setXYZ(i, x / L, y / L, z / L));
  }
  const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vP;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float f = sin(vP.y*1400.)*sin(vP.x*1400.+vP.z*1400.);
        diffuseColor.rgb *= .95 + .05*f;`);
  };
  const mesh = new THREE.SkinnedMesh(ng, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  mesh.bind(body.skeleton, body.bindMatrix);
  return mesh;
}

function filterClip(clip) {
  // Las animaciones se hicieron sobre un maniquí: sólo se usan rotaciones
  // (y la posición de la cadera) para no deformar las proporciones de cada persona.
  const c = clip.clone();
  c.tracks = c.tracks.filter(t => t.name.endsWith('.quaternion') || t.name === 'pelvis.position');
  return c;
}

let clipsP = null;
function clips() {
  if (!clipsP) clipsP = load('anims.glb').then(g => Object.fromEntries(g.animations.map(a => [a.name, filterClip(a)])));
  return clipsP;
}

export async function preload() { await Promise.all([load('male.glb'), load('female.glb'), clips()]); }

export class Avatar {
  constructor(scene, look, name, isMe) {
    this.scene = scene; this.look = { ...DEFAULT_LOOK, ...look }; this.name = name || ''; this.isMe = isMe;
    this.root = new THREE.Group(); scene.add(this.root);
    this.pos = new THREE.Vector3(0, 0, 1); this.rot = Math.PI; this.target = null; this.path = [];
    this.state = 'idle'; this.seat = -1; this.speed = 1.25; this.emote = null; this.talkUntil = 0;
    this.ready = this.build();
  }
  async build() {
    const L = this.look;
    const [g, cl] = await Promise.all([load(L.g === 'male' ? 'male.glb' : 'female.glb'), clips()]);
    const model = skeletonClone(g.scene);
    let body = null;
    model.traverse(o => {
      if (o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
        if (/Superhero|Retopology/.test(o.name) || /Superhero/.test(o.material.name)) body = o;
      }
    });
    if (body) {
      const skinTex = await loadTex(`skin_${L.g === 'male' ? 'male' : 'female'}_${L.skin === 'dark' ? 'dark' : 'light'}.webp`);
      const bm = body.material.clone(); bm.map = skinTex;
      body.material = clothesMaterial(bm, body.skeleton, L);
      this.body = body;
      const shirt = clothShell(body, 'shirt', .02, 40, new THREE.Color(SHIRTS[L.shirt] || SHIRTS[0]), .95);
      const pants = clothShell(body, 'pants', .016, 70, new THREE.Color(PANTS[L.pants] || PANTS[0]), .85);
      [pants, shirt].forEach(m => { if (m) { body.parent.add(m); m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale); } });
    }
    // pelo del modelo base: se reemplaza por el elegido
    model.traverse(o => { if (o.isMesh && o.material && /Hair/.test(o.material.name)) { const mm = o.material.clone(); mm.color = new THREE.Color(HAIR_COLORS[L.hairC % HAIR_COLORS.length]).multiplyScalar(1.6); o.material = mm; } });
    const hairList = HAIRS[L.g] || HAIRS.female;
    const hairName = hairList[L.hair % hairList.length];
    const hairCol = new THREE.Color(HAIR_COLORS[L.hairC % HAIR_COLORS.length]);
    const addPiece = async (file) => {
      const h = await load(file + '.glb');
      const piece = skeletonClone(h.scene);
      const bones = {}; model.traverse(o => { if (o.isBone) bones[o.name] = o; });
      piece.traverse(o => {
        if (o.isSkinnedMesh) {
          const sk = o.skeleton;
          const nb = sk.bones.map(b => bones[b.name] || b);
          o.bind(new THREE.Skeleton(nb, sk.boneInverses), o.bindMatrix);
          o.castShadow = true; o.frustumCulled = false;
          const mm = o.material.clone(); mm.color = hairCol.clone().multiplyScalar(2.2); o.material = mm;
          o.userData.piece = true;
        }
      });
      const meshes = []; piece.traverse(o => { if (o.isSkinnedMesh) meshes.push(o); });
      meshes.forEach(ms => model.add(ms));
    };
    await addPiece(hairName);
    if (L.g === 'male' && L.beard) await addPiece('hair_beard');

    this.model = model; this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions = {};
    for (const [k, c] of Object.entries(cl)) this.actions[k] = this.mixer.clipAction(c);
    ['Sitting_Enter', 'Sitting_Exit', 'Celebration', 'Interact'].forEach(k => { const a = this.actions[k]; if (a) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; } });
    this.current = null; this.play('Idle_Loop', 0);
    this.mixer.addEventListener('finished', (e) => this.onFinished(e.action));
    this.root.position.copy(this.pos); this.root.rotation.y = this.rot;
  }
  play(name, fade = .25) {
    const a = this.actions && this.actions[name]; if (!a || this.current === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a; this.currentName = name;
  }
  onFinished(action) {
    const n = action.getClip().name;
    if (n === 'Sitting_Enter') { this.state = 'sit'; this.play(this.talking() ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop', .2); }
    else if (n === 'Sitting_Exit') { this.state = 'idle'; this.seat = -1; this.play('Idle_Loop', .2); if (this.afterStand) { const f = this.afterStand; this.afterStand = null; f(); } }
    else if (n === 'Celebration' || n === 'Interact') { this.emote = null; this.play(this.state === 'sit' ? 'Sitting_Idle_Loop' : 'Idle_Loop', .3); }
  }
  talking() { return performance.now() < this.talkUntil; }
  say(ms) { this.talkUntil = performance.now() + ms; }
  walkTo(x, z, then) {
    const go = () => {
      this.dest = new THREE.Vector3(x, 0, z);
      this.path = this.planner ? this.planner(this.pos, this.dest) : [this.dest.clone()];
      if (!this.path.length) this.path = [this.dest.clone()];
      this.target = this.path.shift(); this.onArrive = then || null; this.state = 'walk'; this.emote = null; this.play('Walk_Loop', .2);
    };
    if (this.state === 'sit' || this.state === 'sitting') { this.standUp(go); } else go();
  }
  sitAt(i, seat, front) {
    this.walkTo(front.x, front.z, () => {
      this.seat = i; this.state = 'sitting';
      this.pos.set(seat.x, 0, seat.z + .08); this.rot = seat.rot; this.play('Sitting_Enter', .15);
    });
  }
  standUp(then) {
    if (this.state !== 'sit' && this.state !== 'sitting') { then && then(); return; }
    this.afterStand = () => { this.pos.z += .55; then && then(); };
    this.state = 'standing'; this.play('Sitting_Exit', .15);
  }
  doEmote(n) { if (this.state === 'walk' || this.state === 'sitting' || this.state === 'standing') return; if (this.state === 'sit' && n !== 'Interact') return; this.emote = n; this.play(n, .2); }
  dance() { if (this.state !== 'idle') return; this.emote = 'Dance_Loop'; this.play('Dance_Loop', .3); }
  update(dt, room) {
    if (!this.mixer) return;
    if (this.state === 'walk' && this.target) {
      const d = new THREE.Vector3().subVectors(this.target, this.pos); d.y = 0;
      const dist = d.length();
      if (dist < .06 && this.path && this.path.length) {
        this.target = this.path.shift();
      } else if (dist < .06) {
        this.target = null; this.state = 'idle'; this.play('Idle_Loop', .25);
        const f = this.onArrive; this.onArrive = null; if (f) f();
      } else {
        d.normalize();
        const want = Math.atan2(d.x, d.z);
        this.rot = lerpAngle(this.rot, want, Math.min(1, dt * 10));
        const step = Math.min(dist, this.speed * dt);
        const nx = this.pos.x + d.x * step, nz = this.pos.z + d.z * step;
        const stuck = !room.walkable(this.pos.x, this.pos.z); const free = (x, z) => stuck || room.walkable(x, z);
        if (free(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
        else if (free(nx, this.pos.z)) this.pos.x = nx;
        else if (free(this.pos.x, nz)) this.pos.z = nz;
        else { this.target = null; this.state = 'idle'; this.play('Idle_Loop', .25); }
      }
    } else if (this.state === 'idle' && !this.emote) {
      this.play(this.talking() ? 'Idle_Talking_Loop' : 'Idle_Loop', .35);
    } else if (this.state === 'sit') {
      this.play(this.talking() ? 'Sitting_Talking_Loop' : 'Sitting_Idle_Loop', .35);
    }
    this.root.position.lerp(this.pos, Math.min(1, dt * (this.isMe ? 30 : 8)));
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.rot, Math.min(1, dt * 12));
    this.mixer.update(dt);
  }
  // estado compacto para mandar a la pareja
  snapshot() {
    return { x: +this.pos.x.toFixed(3), z: +this.pos.z.toFixed(3), r: +this.rot.toFixed(3), s: this.state, seat: this.seat,
      tx: this.dest && this.state === 'walk' ? +this.dest.x.toFixed(3) : null, tz: this.dest && this.state === 'walk' ? +this.dest.z.toFixed(3) : null, e: this.emote };
  }
  applyRemote(st, room) {
    if (!this.mixer) return;
    const was = this.state;
    if (st.s === 'walk' && st.tx != null) {
      if (was === 'sit' || was === 'sitting') { this.state = 'idle'; }
      if (this.pos.distanceTo(new THREE.Vector3(st.x, 0, st.z)) > .6) this.pos.set(st.x, 0, st.z);
      if (!this.dest || this.dest.x !== st.tx || this.dest.z !== st.tz || this.state !== 'walk') { this.state = 'idle'; this.walkTo(st.tx, st.tz); }
    } else if (st.s === 'sit' || st.s === 'sitting') {
      if (was !== 'sit' && was !== 'sitting') { this.seat = st.seat; this.pos.set(st.x, 0, st.z); this.rot = st.r; this.state = 'sitting'; this.target = null; this.play('Sitting_Enter', .15); }
    } else if (st.s === 'standing') {
      if (was === 'sit' || was === 'sitting') { this.state = 'standing'; this.play('Sitting_Exit', .15); }
    } else if (st.s === 'idle') {
      if (was === 'walk') { this.target = null; }
      if (was !== 'standing') { this.state = 'idle'; this.pos.set(st.x, 0, st.z); this.rot = st.r; }
      if (st.e && st.e !== this.emote) { if (st.e === 'Dance_Loop') this.dance(); else this.doEmote(st.e); }
      if (!st.e && this.emote === 'Dance_Loop') { this.emote = null; }
    }
  }
  headWorld(v) { v.copy(this.root.position); v.y += (this.state === 'sit' || this.state === 'sitting') ? 1.45 : 1.95; return v; }
  dispose() { this.scene.remove(this.root); }
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
