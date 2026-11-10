// S1 · 远山长卷 — misty ink-wash mountain handscroll (baked procedural ink layers, mist, water, crane flock)
import * as THREE from 'three';
import * as S from '../shaders.js';
import * as R from './ranges.js';
import { bake, mulberry, clamp, lerp, sstep, damp } from '../util.js';
import { createFlock } from '../cranes.js';

export function createMountains(ctx) {
  const { TIER, C, noise } = ctx; const WL = -.25; const NU = { value: 0 }; /* night-ink amount, shared by every material */ const rnd = mulberry(20261106);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(42, 1, .1, 220);
  const tU = [];
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: S.skyVert, fragmentShader: S.skyFrag, depthWrite: false, depthTest: false,
    uniforms: { uNight: NU, uT: { value: 0 }, uAspect: { value: 1 }, uSun: { value: 1 }, uScroll: { value: 0 }, uPaper: { value: new THREE.Color('#e9e0ce') }, uPaper2: { value: C.paper2 }, uSunC: { value: C.seal } } }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const X0 = 26, X1 = -60;
  const LAYERS = [
    { z: -82, h: 20, w: 58, ink: .55, gap: .62, snow: .6, peak: 1.0, freq: 2.2 },
    { z: -60, h: 14, w: 44, ink: .62, gap: .6, snow: .5, peak: .9, freq: 2.6 },
    { z: -42, h: 10, w: 32, ink: .72, gap: .62, snow: .35, peak: .8, freq: 3.0 },
    { z: -28, h: 7, w: 22, ink: .8, gap: .7, snow: .25, peak: .7, freq: 3.2, pine: .3, ps: 1.05 },
    { z: -17, h: 4.6, w: 14, ink: .9, gap: .85, snow: .15, peak: .5, freq: 3.4, pine: .4, ps: .9 },
    { z: -9, h: 3, w: 9, ink: 1, gap: 1.6, snow: 0, peak: .35, freq: 3.6, pine: .5, ps: .75 },
  ];
  if (TIER === 0) LAYERS.splice(1, 1);
  const geo = new THREE.PlaneGeometry(1, 1);
  // ---- eroded 3D massifs, inked from their own structure (see ranges.js)
  const mountains = new THREE.Group(); scene.add(mountains); const reflections = new THREE.Group(); scene.add(reflections); const rT = { value: 0 }; tU.push(rT);
  const jobs = []; const DEN = [190, 260, 330][TIER]; const pineTex = { value: null }; const mossPR = { value: 1 };
  const MU = { uN: { value: noise }, uPaper: { value: C.paper }, uInk: { value: C.ink }, uFog: { value: new THREE.Color('#e4dccb') }, uNight: NU, uWL: { value: WL }, uT: rT };
  const inkMat = (L, refl) => new THREE.ShaderMaterial({ vertexShader: R.MV, fragmentShader: R.MF, transparent: true, depthWrite: true, side: refl ? THREE.DoubleSide : THREE.FrontSide, extensions: { derivatives: true },
    uniforms: { ...MU, uF1: { value: 75 / L.h }, uRefl: { value: refl ? 1 : 0 }, uBase: { value: -1.4 }, uH: { value: L.h }, uFar: { value: L.far || 95 }, uFoot: { value: L.foot } } });
  const RIBU = { uRes: { value: new THREE.Vector2(1, 1) } };
  const ribMat = L => new THREE.ShaderMaterial({ vertexShader: R.RIB_V, fragmentShader: R.RIB_F, transparent: true, depthWrite: false, uniforms: { uRes: RIBU.uRes, uW: { value: 1.6 }, uNight: NU, uFar: { value: L.far || 95 }, uN: { value: noise } } });
  const LAYERS3 = [
    { z: -82, h: 21, w: 58, gap: .62, foot: .42, erode: .5 }, { z: -60, h: 15, w: 44, gap: .6, foot: .38, erode: .6, main: true },
    { z: -42, h: 10, w: 32, gap: .62, foot: .34, erode: .7 }, { z: -28, h: 7, w: 22, gap: .7, foot: .3, erode: .8, trees: 1 },
    { z: -17, h: 4.6, w: 14, gap: .85, foot: .26, erode: .9, trees: 1 }, { z: -9, h: 3, w: 9, gap: 1.6, foot: .22, erode: 1, trees: 1 },
  ];
  if (TIER === 0) LAYERS3.splice(1, 1);
  const addMassif = (L, cxm, zz, W, D, pk, seed) => { const dist = 11 - L.z, cell = Math.max(.05, dist / DEN);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), inkMat(L, false)); mesh.position.set(cxm, 0, zz); mesh.userData.x0 = cxm; mountains.add(mesh);
    const rmesh = new THREE.Mesh(mesh.geometry, inkMat(L, true)); rmesh.scale.set(1, -1, 1); rmesh.position.set(cxm, 2 * WL, zz); reflections.add(rmesh); mesh.userData.refl = rmesh;
    jobs.push(() => { const M = R.buildMassif({ w: W, d: D, h: L.h, peaks: pk, cell, seed, base: -1.4, erodeK: L.erode }); mesh.geometry = M.g; rmesh.geometry = M.g; if (L.trees) addFlora(mesh, M, L, seed);
      if (M.lines.length) { const rb = new THREE.Mesh(R.ribbonGeometry(M.lines, seed), ribMat(L)); rb.frustumCulled = false; rb.renderOrder = mesh.renderOrder + .0005; mesh.add(rb); } }); };
  // 主峰: one dominant massif rising behind the valley, flanked by 次峰 — the Song "host and guests" hierarchy
  { const L = { z: -70, h: 26, w: 46, foot: .4, erode: .6, far: 150 }; const W = 52, D = 20;
    addMassif(L, 1, -70, W, D, [{ x: 0, z: 0, rx: W * .2, rz: D * .4, h: 26, sharp: 1.05, skew: 1.3 }, { x: -W * .2, z: 2, rx: W * .14, rz: D * .3, h: 19, sharp: 1.2, skew: .7 },
      { x: W * .22, z: 1, rx: W * .13, rz: D * .3, h: 16, sharp: 1.25, skew: 1.4 }, { x: -W * .36, z: 4, rx: W * .1, rz: D * .25, h: 10, sharp: 1.4 }, { x: W * .38, z: 3, rx: W * .1, rz: D * .25, h: 9, sharp: 1.4 }], 7771); }
  LAYERS3.forEach((L, li) => { let x = X0 + rnd() * L.w * .5;
    while (x > X1 - L.w) { const W = L.w * (1.05 + rnd() * .35), D = L.w * .42, cxm = x - W / 2, zz = L.z + (rnd() - .5) * L.h * .25, seed = (rnd() * 1e6) | 0;
      const isMain = false; const pk = []; const open = L.z > -45 ? .3 + .7 * sstep(L.w * .25, L.w * .85, Math.abs(cxm - 1)) : 1;   // the valley stays open toward the main peak
      pk.push({ x: (rnd() - .5) * .25 * W, z: (rnd() - .5) * .15 * D, rx: W * (.2 + rnd() * .12), rz: D * .42, h: open * L.h * (isMain ? 1.55 : .8 + rnd() * .3), sharp: isMain ? 1.15 : 1.1 + rnd() * .5, skew: .6 + rnd() * .8 });   // 主峰
      for (let k = 0, n = 2 + (rnd() * 3 | 0); k < n; k++) pk.push({ x: (rnd() - .5) * .8 * W, z: (rnd() - .5) * .3 * D, rx: W * (.1 + rnd() * .12), rz: D * .3, h: open * L.h * (.45 + rnd() * .4), sharp: 1.1 + rnd() * .6, skew: .6 + rnd() * .8 });   // 次峰
      for (let k = 0; k < 3; k++) pk.push({ x: (rnd() - .5) * .9 * W, z: D * (.18 + rnd() * .12), rx: W * (.12 + rnd() * .1), rz: D * .2, h: L.h * (.16 + rnd() * .16), sharp: 1.6 });       // 坡脚 foothills
      addMassif(L, cxm, zz, W, D, pk, seed);
      x -= L.w * L.gap; } });
  mountains.children.sort((a, b) => a.position.z - b.position.z).forEach((m, i) => m.renderOrder = -5 + i * .001);
  reflections.children.sort((a, b) => a.position.z - b.position.z).forEach((m, i) => m.renderOrder = -7 + i * .0005);
  jobs.unshift(() => { pineTex.value = R.pineAtlas(11); });
  const treeMats = [], mossMats = [];
  function addFlora(mesh, M, L, seed) { const r = mulberry(seed + 7); const P = M.g.attributes.position, N = M.g.attributes.normal, RG = M.RG; const tr = [], ms = [];
    for (let k = 0; k < P.count; k++) { const y = P.getY(k) + 1.4; if (y < L.h * .12) continue; const ny = N.getY(k);
      if (RG[k] > .25 && ny > .55 && r() < .022 * (M.cx / .08) ** 2) tr.push(P.getX(k), P.getY(k) - .03 * L.h, P.getZ(k), L.h * (.13 + r() * .07));    // pines on crests and ledges
      else if (ny > .62 && ny < .9 && RG[k] > .12 && r() < .006 * (M.cx / .08) ** 2) tr.push(P.getX(k), P.getY(k) - .03 * L.h, P.getZ(k), L.h * (.09 + r() * .05));
      if (RG[k] > .35 && r() < .06 * (M.cx / .08) ** 2) ms.push(P.getX(k), P.getY(k) + .01, P.getZ(k)); }
    const nt = tr.length / 4; if (nt) { const pg = new THREE.PlaneGeometry(1, 1); const ig = new THREE.InstancedBufferGeometry(); ig.index = pg.index; ig.setAttribute('position', pg.attributes.position); ig.setAttribute('uv', pg.attributes.uv);
      ig.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(tr), 4)); ig.setAttribute('aV', new THREE.InstancedBufferAttribute(new Float32Array(nt).map(() => (r() * 4) | 0), 1)); ig.instanceCount = nt;
      const tm = new THREE.ShaderMaterial({ vertexShader: R.TREE_V, fragmentShader: R.TREE_F, transparent: true, depthWrite: false, uniforms: { map: pineTex, uPaper: MU.uPaper, uInk: MU.uInk, uNight: NU, uFar: { value: 95 }, uWL: MU.uWL } });
      const t = new THREE.Mesh(ig, tm); t.frustumCulled = false; t.renderOrder = mesh.renderOrder + .0004; mesh.add(t); treeMats.push(tm); }
    const nm = ms.length / 3; if (nm) { const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ms), 3));
      mg.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(nm * 3).map((_, i) => i % 3 === 0 ? 2.5 + r() * 3.5 : i % 3 === 1 ? (r() - .5) * .6 : 0), 3));
      const mm = new THREE.ShaderMaterial({ vertexShader: R.MOSS_V, fragmentShader: R.MOSS_F, transparent: true, depthWrite: false, uniforms: { uInk: MU.uInk, uPaper: MU.uPaper, uNight: NU, uFar: { value: 95 }, uPR: mossPR } });
      const pts = new THREE.Points(mg, mm); pts.frustumCulled = false; pts.renderOrder = mesh.renderOrder + .0003; mesh.add(pts); mossMats.push(mm); } }
  let mistTex = null;
  jobs.push(() => { mistTex = bake(new THREE.ShaderMaterial({ vertexShader: S.bakeVert, fragmentShader: S.mistBakeFrag, depthTest: false, depthWrite: false, uniforms: { uOrigin: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(1, 1) }, uDist: { value: 1 } } }), 512, 128, { mip: false, wrap: true }); });
  const mists = new THREE.Group(); scene.add(mists);
  [-70, -50, -34, -22, -12].forEach((z, i) => { for (let x = X0; x > X1 - 40; x -= 46) {
    const m = new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.mistTexFrag, transparent: true, depthWrite: false, uniforms: { map: { value: null }, uT: { value: 0 }, uSeed: { value: rnd() }, uA: { value: .8 - i * .06 }, uPaper: { value: C.paper }, uNight: NU } });
    tU.push(m.uniforms.uT); const mesh = new THREE.Mesh(geo, m); const s = 1 + (-z) / 30; mesh.scale.set(54 * s, 3.2 * s, 1); mesh.position.set(x, -.6 + s * .5 + rnd() * .6, z); mists.add(mesh); } });
  mists.children.forEach(m => { const z = m.position.z; m.renderOrder = -5 + (mountains.children.filter(c => c.position.z < z).length) * .001 + .0005; });
  const WU = { uT: { value: 0 }, uHz: { value: .4 }, uAsp: { value: 1 }, uSunA: { value: 1 }, uScroll: { value: 0 }, uNight: NU, uPaper0: { value: C.paper }, uInkC0: { value: C.ink }, uSunC0: { value: C.seal }, uRes: { value: new THREE.Vector2(1, 1) }, uN: { value: noise },
    uRings: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, uBlots: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.waterFrag, transparent: true, depthWrite: false, uniforms: WU }));
  water.rotation.x = -Math.PI / 2; water.position.set(-20, WL, -30); water.renderOrder = -6; scene.add(water); tU.push(WU.uT);
  // a lone fishing boat in the middle distance, and its reflection
  const boats = []; for (const r of [0, 1]) { const bm = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.boatFrag, transparent: true, depthWrite: false, uniforms: { uT: WU.uT, uRefl: { value: r }, uInkC: { value: C.ink }, uN: { value: noise }, uNight: NU } }));
    bm.scale.set(1.15, r ? -.41 : .41, 1); bm.position.set(-4.6, WL + (r ? -.205 : .195), -7.5); bm.renderOrder = r ? -6.5 : -4.9; scene.add(bm); boats.push(bm); }
  let ringI = 0, blotI = 0; const lastR = new THREE.Vector3(1e9, 0, 0); let lastRT = -9; const _d = new THREE.Vector3(), _h = new THREE.Vector3();
  const hitWater = (u, v) => { _d.set(u * 2 - 1, v * 2 - 1, .5).unproject(camera).sub(camera.position); if (_d.y > -1e-4) return null; const k = (WL - camera.position.y) / _d.y; if (k > 70) return null; return _h.copy(camera.position).addScaledVector(_d, k); };
  const ring = (x, z, t, a) => { WU.uRings.value[ringI++ % 8].set(x, z, t, a); };
  let tNow = 0;
  // ---- 破墨入卷 opening: a pair of foreground cliff walls with pine branches framing the valley (camera-space doors)
  // 门崖: real relief geometry inked by the same structure-driven shader as the ranges; one hanging pine on each
  const DOORS = { desk: 1.15, port: .24 }; const doors = []; let doorR = 0;
  const doorMat = side => new THREE.ShaderMaterial({ vertexShader: R.MV, fragmentShader: R.MF, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
    uniforms: { ...MU, uWL: { value: -1e9 }, uLoc: { value: 1 }, uFade: { value: 0 }, uLS: { value: 10 }, uL: { value: new THREE.Vector3(.75, .35, .55) }, uCK: { value: 1 }, uF1: { value: 13 }, uRefl: { value: 0 }, uBase: { value: 0 }, uH: { value: 26 }, uFar: { value: 95 }, uFoot: { value: .3 } } });
  const pineMats = [];
  for (const side of [-1, 1]) { const m = new THREE.Mesh(new THREE.BufferGeometry(), doorMat(side)); m.renderOrder = 30; m.frustumCulled = false; m.userData.side = side;
    const pm = new THREE.ShaderMaterial({ vertexShader: R.PINE_V, fragmentShader: R.PINE_F, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true },
      uniforms: { map: { value: null }, uInk: MU.uInk, uPaper: MU.uPaper, uNight: NU, uA: { value: 1 } } }); pineMats.push(pm);
    const pine = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(.5, -.5, 0), pm); pine.renderOrder = 31; pine.frustumCulled = false; m.add(pine); m.userData.pine = pine;
    camera.add(m); doors.push(m); }
  const buildDoors = r => { doorR = r; doors.forEach((d, i) => { const c = R.buildCliff({ r, seed: i ? 17 : 5, ny: [300, 380, 440][TIER] });
      d.geometry.dispose(); d.geometry = c.g;
      // pine root on the upper inner face, canopy reaching over the valley above the title line
      const y0 = i ? 2.32 : 2.2, s = r < .5 ? .4 : (i ? .56 : 1); const ps = s * (r < .5 ? 1 : 1); d.userData.pine.scale.set(ps, ps, 1);
      d.userData.pine.position.set(c.edge(y0) - ps * .04, y0 + ps * .6, .05); }); };
  jobs.push(() => { pineMats.forEach((m, i) => m.uniforms.map.value = R.hangingPine(i ? 23 : 9)); buildDoors(camera.aspect < .8 ? DOORS.port : DOORS.desk); });
  scene.add(camera);
  // gold-leaf flecks drifting through the night version
  const NF = [40, 70, 100][TIER]; const fg = new THREE.BufferGeometry(); const fa = new Float32Array(NF * 4);
  for (let i = 0; i < NF; i++) fa.set([-26 + rnd() * 46, -.1 + Math.pow(rnd(), 1.6) * 7.5, -34 + rnd() * 40, rnd()], i * 4);
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3)); fg.setAttribute('aR', new THREE.BufferAttribute(fa, 4));
  const flecks = new THREE.Points(fg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: WU.uT, uNight: NU, uPR: { value: 1 } },
    vertexShader: /* glsl */`uniform float uT,uPR;attribute vec4 aR;varying float vB;varying float vR;void main(){vec3 p=aR.xyz;float s=aR.w*40.;
      p+=vec3(sin(uT*.13+s)*1.4,sin(uT*.21+s*1.7)*.5-mod(uT*.05*(.4+aR.w)+s,1.)*.0,cos(uT*.11+s)*.9);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      vB=pow(.5+.5*sin(uT*(1.1+aR.w*2.)+s*3.),3.)*.85+.15;vR=uT*(.6+aR.w)+s;gl_PointSize=uPR*(1.6+aR.w*aR.w*aR.w*aR.w*7.)*clamp(9./-mv.z,.4,2.4);}`,
    fragmentShader: /* glsl */`uniform float uNight;varying float vB;varying float vR;void main(){vec2 q=gl_PointCoord-.5;float c=cos(vR),s=sin(vR);q=mat2(c,-s,s,c)*q;q.y*=1.9;
      float f=smoothstep(.36,.22,abs(q.x)+abs(q.y)*.7);if(f*uNight<.01)discard;gl_FragColor=vec4(vec3(.95,.76,.4)*f*vB*uNight,1.);}` }));
  flecks.frustumCulled = false; flecks.renderOrder = 20; scene.add(flecks);
  const ease3 = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const push = o => o < .38 ? .2 * Math.pow(o / .38, 3) : .2 + .8 * (1 - Math.pow(1 - (o - .38) / .62, 3));   // slow → fast at the impact → long ease-out
  let lastOpen = -1;
  const flock = createFlock({ count: [10, 18, 26][TIER], tier: TIER, window: 20 }); flock.mesh.renderOrder = 1; scene.add(flock.mesh);

  const KEYS = [[2, 2.4, 11, 0, 2.9], [-9, 1.7, 7, -2.5, 2.3], [-17, 1.25, 4.5, -3, 1.7]];
  const cam = { x: 2, y: 2.4, z: 11, lx: 0, ly: 2.9 }, look = new THREE.Vector3(); let init = false;
  function finish() { mists.children.forEach(m => m.material.uniforms.map.value = mistTex); }
  return {
    id: 'mountains', scene, camera, jobs, finish, get dark() { return lastOpen >= .62 ? 1 : 0; }, setNight(v) { NU.value = v; },
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 58 : 42; camera.updateProjectionMatrix(); sky.material.uniforms.uAspect.value = w / h; WU.uAsp.value = w / h; },
    click(u, v) { if (v > WU.uHz.value - .01) return false; const h = hitWater(u, v); if (!h || h.z < -45) return false; WU.uBlots.value[blotI++ % 4].set(h.x, h.z, tNow, (1.1 + Math.random() * .4) * (1 + Math.max(0, -h.z - 4) * .04)); ring(h.x, h.z, tNow, 1); return true; },
    update(st) {
      const { t, dt, p, ptr, intro } = st; for (const u of tU) u.value = t;
      const q = clamp(p) * 2, i = Math.min(1, Math.floor(q)), f0 = q - i, f = lerp(f0, f0 * f0 * (3 - 2 * f0), .55);
      const a = KEYS[i], b = KEYS[i + 1]; const ie = 1 - Math.pow(1 - intro, 3);
      const tx = lerp(a[0], b[0], f), ty = lerp(a[1], b[1], f) + (1 - ie) * 1.4, tz = lerp(a[2], b[2], f) + (1 - ie) * 9, tlx = lerp(a[3], b[3], f), tly = lerp(a[4], b[4], f);
      if (!init || st.snap) { Object.assign(cam, { x: tx, y: ty, z: tz, lx: tlx, ly: tly }); init = true; }
      const k = st.k; cam.x = damp(cam.x, tx, k, dt); cam.y = damp(cam.y, ty, k, dt); cam.z = damp(cam.z, tz, k, dt); cam.lx = damp(cam.lx, tlx, k, dt); cam.ly = damp(cam.ly, tly, k, dt);
      const op = st.open || 0, pe = push(op);
      camera.position.set(cam.x + ptr.x * .35, cam.y + ptr.y * .2 + Math.sin(t * .25) * .04 - pe * .35, cam.z - pe * 8.5);
      look.set(cam.x + cam.lx + ptr.x * .15, cam.ly + ptr.y * .1 - pe * .25, cam.z - 12 - pe * 8.5);
      if (Math.abs(op - lastOpen) > 1e-4) { lastOpen = op; const es = ease3(sstep(0, .62, op));             // the ranges part to open a valley
        for (const m of mountains.children) { const z = -m.position.z, dx = Math.sign(m.userData.x0 + m.scale.x * 0 - 2) * es * 9 * Math.pow(9 / z, .7); m.position.x = m.userData.x0 + dx; if (m.userData.refl) m.userData.refl.position.x = m.position.x; } }
      { const eo = x => 1 - (1 - x) * (1 - x) * (1 - .4 * x), ed = eo(sstep(0, .6, op)), em = eo(sstep(0, .72, op)), port = camera.aspect < .8;
        for (const b of boats) b.visible = pe < .3; flecks.material.uniforms.uPR.value = (st.rtH || 800) / 850; mossPR.value = (st.rtH || 800) / 850; RIBU.uRes.value.set(st.rtW, st.rtH); flecks.visible = NU.value > 0 || op > .2;
        const want = port ? DOORS.port : DOORS.desk; if (doorR && want !== doorR) buildDoors(want);
        for (const d of doors) { const sd = d.userData.side, D = 4, hh = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * D, hw = hh * camera.aspect;
          const Hs = hh * 2.2 / 2.6, k = 1 + .38 * ed, W = doorR * Hs;                                    // uniform scale: local units → camera space
          d.scale.set(-sd * Hs * k, Hs * k, Hs * k); d.position.set(sd * (hw + ed * (W * 1.15 + hw * .2)), -hh * 1.15 + ed * hh * .1, -D);
          d.visible = ed < .999 && doorR > 0; const fa = 1 - sstep(.82, 1, ed); d.material.uniforms.uFade.value = 1 - fa; d.userData.pine.material.uniforms.uA.value = fa; } } camera.lookAt(look); camera.rotation.z += Math.sin(t * .17) * .002;
      sky.material.uniforms.uScroll.value = p * .3; sky.material.uniforms.uSun.value = 1 - sstep(.2, .6, p) * .7;
      tNow = t; WU.uRes.value.set(st.rtW, st.rtH); WU.uScroll.value = p * .3; WU.uSunA.value = sky.material.uniforms.uSun.value;
      _h.set(camera.position.x, WL, camera.position.z - 400).project(camera); WU.uHz.value = _h.y * .5 + .5;
      if (st.pointerIn && st.ptrScreen.y < WU.uHz.value - .01) { const h = hitWater(st.ptrScreen.x, st.ptrScreen.y);
        if (h && h.z > -26) { const dd = h.distanceTo(lastR); if (dd > .55 || (dd > .08 && t - lastRT > .5)) { ring(h.x, h.z, t, Math.min(1, .35 + dd * .25)); lastR.copy(h); lastRT = t; } } }
      const fv = sstep(.18, .5, p); flock.anchor.set(cam.x + 4 - fv * 3 + Math.sin(t * .13) * 2, cam.y + 4.3 + fv * 4.2, cam.z - 21); flock.update(t); // the flock climbs out of frame as the copy column arrives (keeps text clean)
    },
  };
}
