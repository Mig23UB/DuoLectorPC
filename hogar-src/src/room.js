// La habitación: una casita acogedora con ventana al cielo, sillón para dos,
// marcos para sus fotos, biblioteca, lámpara y una camita para Lumi.
// Todo está hecho con geometría simple para que cargue rápido en un teléfono.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const ROOM = { minX: -4, maxX: 4, minZ: -3, maxZ: 3, wallH: 3 };
export const SEATS = [
  { x: 0.05, z: -1.95, rot: 0 },
  { x: 0.95, z: -1.95, rot: 0 },
];
export const SOFA_FRONT = (i) => ({ x: SEATS[i].x, z: -1.35 });

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  if (repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]); }
  return tx;
}
function rnd(seed) { let s = seed; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }

function woodFloor() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const r = rnd(3), rows = 8, ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 300;
      while (x < w) {
        const len = 260 + r() * 260;
        const base = 150 + r() * 30;
        g.fillStyle = `rgb(${base + 40},${base - 10},${base - 60})`;
        g.fillRect(x, i * ph, len, ph);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(90,55,25,${0.05 + r() * 0.08})`; g.lineWidth = 1 + r() * 2;
          const y = i * ph + r() * ph; g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * 0.3, y + (r() - .5) * 8, x + len * 0.6, y + (r() - .5) * 8, x + len, y + (r() - .5) * 6); g.stroke();
        }
        g.fillStyle = 'rgba(60,35,15,.55)'; g.fillRect(x, i * ph, 2, ph);
        x += len;
      }
      g.fillStyle = 'rgba(60,35,15,.5)'; g.fillRect(0, i * ph, w, 2);
    }
  }, [2, 2]);
}
function plaster(col) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    const r = rnd(9);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() > .5 ? '255,255,255' : '120,100,80'},${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
  }, [3, 1.5]);
}

// Cielo de la ventana: un shader que mezcla día y noche con un solo número.
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uNight: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float uNight; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 uv=vUv;
        vec3 dayTop=vec3(.36,.62,.93), dayBot=vec3(.80,.90,.98);
        vec3 nTop=vec3(.02,.03,.11), nBot=vec3(.10,.12,.30);
        vec3 col=mix(mix(dayBot,dayTop,uv.y), mix(nBot,nTop,uv.y), uNight);
        // nubes de día
        float c = n(uv*vec2(3.,6.)+vec2(uTime*.01,0.)) * .6 + n(uv*vec2(7.,12.)+vec2(uTime*.02,0.)) * .4;
        c = smoothstep(.55,.8,c) * (1.-uNight) * smoothstep(.25,.6,uv.y);
        col = mix(col, vec3(1.), c*.85);
        // sol
        float sd = distance(uv*vec2(2.,1.), vec2(1.55,.78));
        col += vec3(1.,.9,.6) * (smoothstep(.12,.0,sd)*.9 + smoothstep(.5,.0,sd)*.25) * (1.-uNight);
        // estrellas que titilan
        vec2 g = uv*vec2(90.,45.); vec2 id=floor(g); vec2 f=fract(g)-.5;
        float s = h(id); float tw = .6+.4*sin(uTime*2.+s*40.);
        float star = step(.93,s) * smoothstep(.12,.0,length(f+vec2(h(id+3.)-.5,h(id+7.)-.5)*.6)) * tw;
        col += vec3(1.,.97,.9) * star * uNight;
        // luna
        vec2 mp = uv*vec2(2.,1.); float md = distance(mp, vec2(.55,.75)); float md2 = distance(mp, vec2(.6,.78));
        float moon = smoothstep(.085,.075,md) * smoothstep(.06,.075,md2);
        col = mix(col, vec3(1.,.96,.82), moon*uNight);
        col += vec3(.6,.65,.9) * smoothstep(.3,.0,md) * .12 * uNight;
        // horizonte: colinas
        float hill = .18 + .05*sin(uv.x*6.+1.) + .03*sin(uv.x*13.);
        vec3 hillC = mix(vec3(.42,.66,.42), vec3(.05,.08,.16), uNight);
        col = mix(col, hillC, smoothstep(hill+.005, hill-.005, uv.y));
        // lucecitas de casas lejanas de noche
        vec2 lg = vec2(uv.x*60., uv.y*120.); vec2 lid=floor(lg);
        float li = step(.965,h(lid)) * step(uv.y, hill-.01) * step(.05,uv.y);
        col += vec3(1.,.75,.4) * li * uNight * .9;
        gl_FragColor = vec4(col,1.);
      }`,
  });
}

function rbox(w, h, d, r, mat) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.castShadow = true; m.receiveShadow = true; return m;
}

export function buildRoom(scene) {
  const clickables = [];
  const obstacles = [];   // cajas en el piso que los personajes esquivan {minX,maxX,minZ,maxZ}
  const frames = [];
  const night = { lamps: [], glows: [], window: null };

  // Piso
  const floorMat = new THREE.MeshStandardMaterial({ map: woodFloor(), roughness: .72, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.kind = 'floor';
  scene.add(floor); clickables.push(floor);

  // Paredes (casa de muñecas: fondo e izquierda; adelante y derecha abiertas)
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster('#efe4d6'), roughness: .95 });
  const wallMat2 = new THREE.MeshStandardMaterial({ map: plaster('#e6dccd'), roughness: .95 });
  // pared del fondo con hueco para la ventana
  const W = { x0: -1.2, x1: 2.2, y0: 1.0, y1: 2.55 };
  const back = new THREE.Group();
  const seg = (x0, x1, y0, y1) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, .16), wallMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, ROOM.minZ - .08); m.receiveShadow = true; m.castShadow = true; back.add(m);
  };
  seg(ROOM.minX, W.x0, 0, ROOM.wallH); seg(W.x1, ROOM.maxX, 0, ROOM.wallH);
  seg(W.x0, W.x1, 0, W.y0); seg(W.x0, W.x1, W.y1, ROOM.wallH);
  scene.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(.16, ROOM.wallH, 6.16), wallMat2);
  left.position.set(ROOM.minX - .08, ROOM.wallH / 2, 0); left.receiveShadow = true; scene.add(left);
  // zócalos
  const trimMat = new THREE.MeshStandardMaterial({ color: '#f7f1e8', roughness: .6 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(8, .12, .04), trimMat); t1.position.set(0, .06, ROOM.minZ + .02); scene.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(.04, .12, 6), trimMat); t2.position.set(ROOM.minX + .02, .06, 0); scene.add(t2);

  // Ventana: cielo + marco + vidrio
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0 + 1.2, W.y1 - W.y0 + .8), skyMaterial());
  sky.position.set((W.x0 + W.x1) / 2, (W.y0 + W.y1) / 2, ROOM.minZ - .6); scene.add(sky);
  night.window = sky.material;
  const fmMat = new THREE.MeshStandardMaterial({ color: '#fbf7f0', roughness: .5 });
  const fw = W.x1 - W.x0, fh = W.y1 - W.y0, cx = (W.x0 + W.x1) / 2, cy = (W.y0 + W.y1) / 2;
  [[fw + .14, .08, cx, W.y1 + .02], [fw + .14, .08, cx, W.y0 - .02], [.08, fh, W.x0 - .02, cy], [.08, fh, W.x1 + .02, cy], [.05, fh, cx, cy], [fw, .05, cx, cy + .2]]
    .forEach(([w, h, x, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, .14), fmMat); b.position.set(x, y, ROOM.minZ); b.castShadow = true; scene.add(b); });
  const sill = rbox(fw + .4, .06, .3, .02, fmMat); sill.position.set(cx, W.y0 - .05, ROOM.minZ + .12); scene.add(sill);
  // cortinas
  const curtMat = new THREE.MeshStandardMaterial({ color: '#c8a7c9', roughness: .9, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(.55, 2.2, 12, 1);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 22) * .04);
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, curtMat); c.position.set(side < 0 ? W.x0 - .35 : W.x1 + .35, 1.75, ROOM.minZ + .12); c.castShadow = true; scene.add(c);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, fw + 1.4), new THREE.MeshStandardMaterial({ color: '#b8925a', metalness: .6, roughness: .35 }));
  rod.rotation.z = Math.PI / 2; rod.position.set(cx, 2.86, ROOM.minZ + .14); scene.add(rod);

  // Alfombra
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), new THREE.MeshStandardMaterial({
    map: canvasTex(512, 512, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#dfe9f6'); gr.addColorStop(.7, '#c9d9ef'); gr.addColorStop(.72, '#5f86c9'); gr.addColorStop(.78, '#c9d9ef'); gr.addColorStop(1, '#b9cbe6');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rnd(5); for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${r() * .08})`; g.fillRect(r() * w, r() * h, 1, 3); }
    }), roughness: 1,
  }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(.5, .005, -.6); rug.scale.set(1.3, 1, 1); rug.receiveShadow = true;
  rug.userData.kind = 'floor'; scene.add(rug); clickables.push(rug);

  // Sillón para dos
  const sofaMat = new THREE.MeshStandardMaterial({ color: '#4f6fa8', roughness: .85 });
  const cushMat = new THREE.MeshStandardMaterial({ color: '#5b7cb8', roughness: .9 });
  const sofa = new THREE.Group(); sofa.position.set(.5, 0, -2.25);
  const base = rbox(2.3, .38, .95, .08, sofaMat); base.position.set(0, .26, 0); sofa.add(base);
  const backr = rbox(2.3, .62, .26, .1, sofaMat); backr.position.set(0, .66, -.36); sofa.add(backr);
  for (const sx of [-1, 1]) { const arm = rbox(.24, .55, .95, .1, sofaMat); arm.position.set(sx * 1.08, .4, 0); sofa.add(arm); }
  for (const sx of [-.45, .45]) {
    const seatC = rbox(.9, .14, .78, .06, cushMat); seatC.position.set(sx, .5, .06); sofa.add(seatC);
    const backC = rbox(.86, .48, .16, .07, cushMat); backC.position.set(sx, .78, -.18); backC.rotation.x = -.12; sofa.add(backC);
  }
  const pillow = rbox(.36, .32, .12, .06, new THREE.MeshStandardMaterial({ color: '#e5a057', roughness: .9 }));
  pillow.position.set(-.82, .7, -.05); pillow.rotation.set(-.2, .3, .15); sofa.add(pillow);
  const pillow2 = rbox(.34, .3, .12, .06, new THREE.MeshStandardMaterial({ color: '#ed6d68', roughness: .9 }));
  pillow2.position.set(.84, .7, -.05); pillow2.rotation.set(-.2, -.3, -.15); sofa.add(pillow2);
  for (const sx of [-1.05, 1.05]) for (const sz of [-.38, .38]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.03, .02, .08), new THREE.MeshStandardMaterial({ color: '#6b4a2b' }));
    leg.position.set(sx, .04, sz); sofa.add(leg);
  }
  sofa.traverse(o => { if (o.isMesh) { o.userData.kind = 'sofa'; clickables.push(o); } });
  scene.add(sofa);
  obstacles.push({ minX: -.7, maxX: 1.7, minZ: -2.8, maxZ: -1.75 });

  // Mesita ratona con taza y libro
  const woodMat = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: .55 });
  const table = new THREE.Group(); table.position.set(.5, 0, -.75);
  const top = rbox(1.1, .06, .55, .02, woodMat); top.position.y = .4; table.add(top);
  for (const sx of [-.48, .48]) for (const sz of [-.22, .22]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .38), woodMat); l.position.set(sx, .19, sz); l.castShadow = true; table.add(l); }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(.045, .04, .1, 20), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: .3 }));
  mug.position.set(-.25, .48, .05); mug.castShadow = true; table.add(mug);
  const book = rbox(.26, .04, .19, .01, new THREE.MeshStandardMaterial({ color: '#36bab8' })); book.position.set(.2, .45, 0); book.rotation.y = .3; table.add(book);
  scene.add(table);
  obstacles.push({ minX: -.15, maxX: 1.15, minZ: -1.1, maxZ: -.4 });

  // Biblioteca
  const shelf = new THREE.Group(); shelf.position.set(3.35, 0, -2.6);
  const sideM = woodMat;
  [[.05, 2.2, .4, -.55, 1.1], [.05, 2.2, .4, .55, 1.1]].forEach(([w, h, d, x, y]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sideM); b.position.set(x, y, 0); b.castShadow = true; shelf.add(b); });
  const bcols = ['#518bdb', '#36bab8', '#e5a057', '#ed6d68', '#bf89cd', '#6b8f5e', '#d9c7a1', '#3b4a6b'];
  const rb = rnd(11);
  for (let s = 0; s < 5; s++) {
    const y = .05 + s * .53;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(1.1, .04, .4), sideM); pl.position.set(0, y, 0); pl.receiveShadow = true; shelf.add(pl);
    if (s === 4) continue;
    let x = -.5;
    while (x < .45) {
      const bw = .04 + rb() * .05, bh = .3 + rb() * .14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, .28), new THREE.MeshStandardMaterial({ color: bcols[Math.floor(rb() * bcols.length)], roughness: .8 }));
      b.position.set(x + bw / 2, y + .02 + bh / 2, 0); if (rb() > .85) b.rotation.z = .12; b.castShadow = true; shelf.add(b);
      x += bw + .006;
      if (rb() > .93) x += .12;
    }
  }
  scene.add(shelf);
  obstacles.push({ minX: 2.7, maxX: 4, minZ: -3, maxZ: -2.3 });

  // Lámpara de pie (se enciende de noche)
  const lamp = new THREE.Group(); lamp.position.set(-1.25, 0, -2.45);
  const metal = new THREE.MeshStandardMaterial({ color: '#2f2a25', metalness: .5, roughness: .4 });
  const lb = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, .04, 24), metal); lb.position.y = .02; lamp.add(lb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 1.6), metal); pole.position.y = .82; lamp.add(pole);
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#f3e3c3', emissive: '#ffcf8a', emissiveIntensity: 0, roughness: .8, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, .32, 32, 1, true), shadeMat); shade.position.y = 1.7; lamp.add(shade);
  lamp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(lamp);
  const lampLight = new THREE.PointLight('#ffb866', 0, 7, 1.6); lampLight.position.set(-1.25, 1.62, -2.45);
  lampLight.castShadow = true; lampLight.shadow.mapSize.set(512, 512); lampLight.shadow.bias = -.004; scene.add(lampLight);
  night.lamps.push({ light: lampLight, max: 9, mat: shadeMat });
  obstacles.push({ minX: -1.5, maxX: -1, minZ: -2.7, maxZ: -2.2 });

  // Guirnalda de lucecitas sobre la ventana
  const bulbs = new THREE.Group();
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, x = W.x0 - .5 + u * (fw + 1), y = 2.75 - Math.sin(u * Math.PI) * .18;
    const m = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf7a', emissiveIntensity: 0 }));
    m.position.set(x, y, ROOM.minZ + .2); bulbs.add(m); night.glows.push(m.material);
  }
  scene.add(bulbs);
  const fairy = new THREE.PointLight('#ffd9a0', 0, 4, 2); fairy.position.set(cx, 2.6, ROOM.minZ + .6); scene.add(fairy);
  night.lamps.push({ light: fairy, max: 2.2 });

  // Plantas
  function plant(x, z, s) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(.2, .15, .36, 24), new THREE.MeshStandardMaterial({ color: '#c97c5d', roughness: .8 }));
    pot.position.y = .18; pot.castShadow = true; g.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#4f8a4b', roughness: .7, side: THREE.DoubleSide });
    const r = rnd(Math.floor(x * 100 + 7));
    for (let i = 0; i < 14; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), leafMat);
      lf.scale.set(.5, 1.6, .18); const a = r() * Math.PI * 2, h = .5 + r() * .45, rr = .08 + r() * .15;
      lf.position.set(Math.cos(a) * rr, h, Math.sin(a) * rr); lf.rotation.set((r() - .5) * .9, a, (r() - .5) * .9); lf.castShadow = true; g.add(lf);
    }
    scene.add(g); obstacles.push({ minX: x - .3 * s, maxX: x + .3 * s, minZ: z - .3 * s, maxZ: z + .3 * s });
  }
  plant(2.15, -2.55, 1.15); plant(-3.6, 2.55, 1.3);

  // Marcos para fotos en la pared izquierda
  const frameMat = new THREE.MeshStandardMaterial({ color: '#3a2a1d', roughness: .5 });
  const matMat = new THREE.MeshStandardMaterial({ color: '#fbf8f2', roughness: .9 });
  const slots = [
    { z: -1.9, y: 1.75, w: .62, h: .8 }, { z: -.85, y: 1.95, w: .9, h: .66 },
    { z: .25, y: 1.65, w: .55, h: .55 }, { z: 1.25, y: 1.85, w: .72, h: .92 },
  ];
  slots.forEach((s, i) => {
    const g = new THREE.Group(); g.position.set(ROOM.minX + .03, s.y, s.z); g.rotation.y = Math.PI / 2;
    const fr = rbox(s.w + .1, s.h + .1, .05, .012, frameMat); g.add(fr);
    const mt = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), matMat); mt.position.z = .027; g.add(mt);
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(s.w - .1, s.h - .1), new THREE.MeshStandardMaterial({ color: '#d9d2c7', roughness: .6 }));
    ph.position.z = .03; g.add(ph);
    // signo "+" mientras está vacío
    const plus = new THREE.Mesh(new THREE.PlaneGeometry(.16, .16), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, 64, 64); c.strokeStyle = '#9a8f80'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(32, 14); c.lineTo(32, 50); c.moveTo(14, 32); c.lineTo(50, 32); c.stroke(); }), transparent: true }));
    plus.position.z = .032; g.add(plus);
    g.traverse(o => { if (o.isMesh) { o.userData.kind = 'frame'; o.userData.slot = i; clickables.push(o); } });
    scene.add(g);
    frames.push({ group: g, photo: ph, plus, w: s.w - .1, h: s.h - .1 });
  });

  // Camita de Lumi
  const bed = new THREE.Group(); bed.position.set(-2.9, 0, 1.9);
  const bedB = new THREE.Mesh(new THREE.TorusGeometry(.32, .11, 14, 32), new THREE.MeshStandardMaterial({ color: '#bf89cd', roughness: .95 }));
  bedB.rotation.x = Math.PI / 2; bedB.position.y = .1; bed.add(bedB);
  const bedC = new THREE.Mesh(new THREE.CylinderGeometry(.32, .32, .08, 32), new THREE.MeshStandardMaterial({ color: '#efe1f2', roughness: 1 }));
  bedC.position.y = .06; bed.add(bedC);
  bed.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(bed);

  // Mesita lateral con vela
  const side = new THREE.Group(); side.position.set(-.95, 0, -1.55);
  const st = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .04, 24), woodMat); st.position.y = .55; side.add(st);
  const sl = new THREE.Mesh(new THREE.CylinderGeometry(.03, .05, .54), woodMat); sl.position.y = .27; side.add(sl);
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .1, 16), new THREE.MeshStandardMaterial({ color: '#fff6e6' })); candle.position.y = .62; side.add(candle);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffae42', emissiveIntensity: 0 }));
  flame.scale.y = 1.8; flame.position.y = .69; side.add(flame); night.glows.push(flame.material);
  side.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(side);
  obstacles.push({ minX: -1.2, maxX: -.7, minZ: -1.8, maxZ: -1.3 });

  return { clickables, obstacles, frames, night, bedPos: new THREE.Vector3(-2.9, 0, 1.9) };
}
