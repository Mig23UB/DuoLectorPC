// Lumi: el robot del hogar. Diseño propio de DuoLector: un cuerpito redondo
// color crema que flota, una carita de pantalla con ojos que parpadean y
// sonríen, una antenita con una estrella que brilla de noche y bracitos.
import * as THREE from 'three';
import { lerpAngle } from './avatar.js';

function faceTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tx };
}

export class Robot {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.pos = new THREE.Vector3(-2.9, 0, 1.9); this.rot = .6; this.target = null;
    this.mood = 'calm'; this.moodUntil = 0; this.blinkAt = 1; this.blink = 0; this.t = 0; this.resting = false;
    this.hearts = [];
    const cream = new THREE.MeshPhysicalMaterial({ color: '#fbf6ec', roughness: .35, clearcoat: .6, clearcoatRoughness: .3 });
    const accent = new THREE.MeshStandardMaterial({ color: '#36bab8', roughness: .4 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1b2233', roughness: .25, metalness: .2 });

    const bodyG = new THREE.Group(); this.body = bodyG; this.root.add(bodyG);
    // cuerpo: un huevito
    const body = new THREE.Mesh(new THREE.SphereGeometry(.2, 40, 32), cream);
    body.scale.set(1, 1.08, .95); body.position.y = .32; body.castShadow = true; bodyG.add(body);
    // pancita con un corazón
    const belly = new THREE.Mesh(new THREE.CircleGeometry(.06, 32), accent);
    belly.position.set(0, .26, .19); belly.rotation.x = -.15; bodyG.add(belly);
    const heart = new THREE.Shape(); heart.moveTo(0, -.022); heart.bezierCurveTo(.04, .01, .02, .04, 0, .02); heart.bezierCurveTo(-.02, .04, -.04, .01, 0, -.022);
    const hm = new THREE.Mesh(new THREE.ShapeGeometry(heart), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffd6e0', emissiveIntensity: .4 }));
    hm.position.set(0, .262, .1915); hm.rotation.x = -.15; bodyG.add(hm);
    // cabeza
    const headG = new THREE.Group(); headG.position.y = .58; bodyG.add(headG); this.head = headG;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 40, 32), cream); head.scale.set(1.25, .95, 1); head.castShadow = true; headG.add(head);
    // pantalla de la cara
    const scr = new THREE.Mesh(new THREE.SphereGeometry(.172, 40, 24, Math.PI * .5 - Math.PI * .32, Math.PI * .64, Math.PI * .3, Math.PI * .42), dark);
    scr.scale.set(1.22, .95, 1.01); headG.add(scr);
    this.face = faceTexture();
    const faceMat = new THREE.MeshBasicMaterial({ map: this.face.tx, transparent: true, toneMapped: false });
    const faceM = new THREE.Mesh(new THREE.SphereGeometry(.174, 40, 24, Math.PI * .5 - Math.PI * .3, Math.PI * .6, Math.PI * .32, Math.PI * .38), faceMat);
    faceM.scale.set(1.22, .95, 1.01); headG.add(faceM);
    // orejitas
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .04, 24), accent);
      ear.rotation.z = Math.PI / 2; ear.position.set(s * .21, 0, 0); headG.add(ear);
    }
    // antena con estrella
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .12), dark); ant.position.y = .2; headG.add(ant);
    const st = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .016 : .038; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? st.lineTo(x, y) : st.moveTo(x, y); }
    this.starMat = new THREE.MeshStandardMaterial({ color: '#ffd76a', emissive: '#ffc23a', emissiveIntensity: .3 });
    const star = new THREE.Mesh(new THREE.ExtrudeGeometry(st, { depth: .014, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 2 }), this.starMat);
    star.position.set(0, .28, -.007); headG.add(star); this.star = star;
    this.glow = new THREE.PointLight('#ffcf6a', 0, 1.6, 2); this.glow.position.y = .28; headG.add(this.glow);
    // bracitos
    this.arms = [];
    for (const s of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(s * .2, .36, 0); bodyG.add(a);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.032, .09, 6, 12), cream); arm.position.y = -.06; arm.castShadow = true; a.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(.036, 16, 12), accent); hand.position.y = -.13; a.add(hand);
      a.rotation.z = s * .35; this.arms.push(a);
    }
    // base: un aro que flota sobre el piso
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.09, .025, 12, 32), accent); ring.rotation.x = Math.PI / 2; ring.position.y = .1; bodyG.add(ring);
    this.ringGlow = new THREE.Mesh(new THREE.CircleGeometry(.12, 32), new THREE.MeshBasicMaterial({ color: '#7fe3e0', transparent: true, opacity: .35, depthWrite: false }));
    this.ringGlow.rotation.x = -Math.PI / 2; this.ringGlow.position.y = .01; this.root.add(this.ringGlow);
    this.root.traverse(o => { if (o.isMesh) o.userData.kind = 'robot'; });
    this.drawFace();
  }
  meshes() { const a = []; this.root.traverse(o => { if (o.isMesh) a.push(o); }); return a; }
  drawFace() {
    const { g, c, tx } = this.face; g.clearRect(0, 0, c.width, c.height);
    const col = '#8ff3ef'; g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 12;
    g.shadowColor = col; g.shadowBlur = 18;
    const ey = 70, ex = [86, 170];
    if (this.mood === 'happy') {
      ex.forEach(x => { g.beginPath(); g.arc(x, ey + 10, 20, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); });
    } else if (this.mood === 'sleep') {
      ex.forEach(x => { g.beginPath(); g.arc(x, ey - 4, 18, Math.PI * .15, Math.PI * .85); g.stroke(); });
    } else {
      const h = 34 * (1 - this.blink * .9);
      ex.forEach(x => { g.beginPath(); g.ellipse(x, ey, 14, Math.max(2, h / 2), 0, 0, Math.PI * 2); g.fill(); });
      if (this.blink < .5) { g.shadowBlur = 0; g.fillStyle = '#ffffff'; ex.forEach(x => { g.beginPath(); g.arc(x + 5, ey - 7, 4, 0, Math.PI * 2); g.fill(); }); }
    }
    // cachetes
    g.shadowBlur = 0; g.fillStyle = 'rgba(255,150,170,.55)';
    [56, 200].forEach(x => { g.beginPath(); g.ellipse(x, ey + 26, 14, 7, 0, 0, Math.PI * 2); g.fill(); });
    // boquita
    g.strokeStyle = col; g.lineWidth = 6; g.beginPath();
    if (this.mood === 'happy') g.arc(128, ey + 18, 14, Math.PI * .15, Math.PI * .85); else g.arc(128, ey + 22, 8, Math.PI * .2, Math.PI * .8);
    g.stroke();
    tx.needsUpdate = true;
  }
  pet() {
    this.mood = 'happy'; this.moodUntil = this.t + 2.4; this.drawFace();
    for (let i = 0; i < 5; i++) this.spawnHeart(i * .12);
  }
  spawnHeart(delay) {
    const s = new THREE.Shape(); s.moveTo(0, -.03); s.bezierCurveTo(.06, .015, .03, .06, 0, .03); s.bezierCurveTo(-.03, .06, -.06, .015, 0, -.03);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: '#ff7a95', transparent: true, side: THREE.DoubleSide }));
    m.position.copy(this.root.position).add(new THREE.Vector3((Math.random() - .5) * .3, .8, (Math.random() - .5) * .2));
    this.scene.add(m); this.hearts.push({ m, life: 1.6, delay });
  }
  setNight(n) { this.starMat.emissiveIntensity = .3 + n * 2.2; this.glow.intensity = n * 1.2; }
  // Comportamiento: sigue a la persona a una distancia cariñosa; si está
  // sentada, se acomoda al lado del sillón; si nadie se mueve, pasea un poco.
  think(people, room) {
    if (!people.length) return;
    const p = people[0];
    let goal;
    if (p.state === 'sit' || p.state === 'sitting') goal = new THREE.Vector3(1.95, 0, -1.45);
    else {
      const d = this.pos.distanceTo(p.pos);
      if (d > 1.6) { const dir = new THREE.Vector3().subVectors(this.pos, p.pos).normalize(); goal = p.pos.clone().addScaledVector(dir, 1.0); }
      else if (Math.random() < .004) goal = new THREE.Vector3(-3 + Math.random() * 6, 0, -.5 + Math.random() * 3);
    }
    if (goal && room.walkable(goal.x, goal.z)) this.target = goal;
    this.lookAt = p.pos;
  }
  update(dt, room, nightAmt) {
    this.t += dt;
    if (this.target) {
      const d = new THREE.Vector3().subVectors(this.target, this.pos); d.y = 0;
      const dist = d.length();
      if (dist < .05) this.target = null;
      else {
        d.normalize(); this.rot = lerpAngle(this.rot, Math.atan2(d.x, d.z), Math.min(1, dt * 5));
        const step = Math.min(dist, .9 * dt), nx = this.pos.x + d.x * step, nz = this.pos.z + d.z * step;
        if (room.walkable(nx, nz, .25)) { this.pos.x = nx; this.pos.z = nz; } else this.target = null;
      }
    } else if (this.lookAt) {
      const d = new THREE.Vector3().subVectors(this.lookAt, this.pos);
      this.rot = lerpAngle(this.rot, Math.atan2(d.x, d.z), Math.min(1, dt * 3));
    }
    const moving = !!this.target;
    this.body.position.y = .05 + Math.sin(this.t * 2.4) * .025;
    this.body.rotation.x = moving ? .12 : 0;
    this.head.rotation.z = Math.sin(this.t * 1.3) * .06;
    this.arms[0].rotation.x = Math.sin(this.t * 4) * (moving ? .5 : .1);
    this.arms[1].rotation.x = -Math.sin(this.t * 4) * (moving ? .5 : .1);
    if (this.mood === 'happy') { this.arms[0].rotation.z = -.35 - Math.abs(Math.sin(this.t * 10)) * .9; this.arms[1].rotation.z = .35 + Math.abs(Math.sin(this.t * 10)) * .9; }
    else { this.arms[0].rotation.z = -.35; this.arms[1].rotation.z = .35; }
    this.star.rotation.y += dt * 1.5;
    this.ringGlow.material.opacity = .25 + Math.sin(this.t * 2.4) * .08;
    this.root.position.lerp(this.pos, Math.min(1, dt * 8));
    this.root.rotation.y = lerpAngle(this.root.rotation.y, this.rot, Math.min(1, dt * 8));
    // parpadeo y humor
    if (this.mood === 'happy' && this.t > this.moodUntil) { this.mood = 'calm'; this.drawFace(); }
    if (this.mood === 'calm') {
      if (this.t > this.blinkAt) { this.blink = Math.min(1, this.blink + dt * 14); if (this.blink >= 1) this.blinkAt = this.t + 2.5 + Math.random() * 3; this.drawFace(); }
      else if (this.blink > 0) { this.blink = Math.max(0, this.blink - dt * 10); this.drawFace(); }
    }
    this.setNight(nightAmt);
    for (const h of this.hearts) {
      if (h.delay > 0) { h.delay -= dt; h.m.visible = false; continue; }
      h.m.visible = true; h.life -= dt; h.m.position.y += dt * .5; h.m.material.opacity = Math.max(0, h.life / 1.6);
      h.m.lookAt(h.m.position.clone().add(new THREE.Vector3(0, 0, 1)));
    }
    this.hearts = this.hearts.filter(h => { if (h.life <= 0) { this.scene.remove(h.m); h.m.geometry.dispose(); return false; } return true; });
  }
  snapshot() { return { x: +this.pos.x.toFixed(2), z: +this.pos.z.toFixed(2), r: +this.rot.toFixed(2), m: this.mood, tx: this.target ? +this.target.x.toFixed(2) : null, tz: this.target ? +this.target.z.toFixed(2) : null }; }
  applyRemote(s) {
    if (Math.hypot(s.x - this.pos.x, s.z - this.pos.z) > .8) this.pos.set(s.x, 0, s.z);
    this.target = s.tx != null ? new THREE.Vector3(s.tx, 0, s.tz) : null;
    if (!this.target) this.rot = s.r;
    if (s.m === 'happy' && this.mood !== 'happy') this.pet();
  }
}
