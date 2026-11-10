// S1 · 远山长卷 — misty ink-wash mountain handscroll (baked procedural ink layers, mist, water, crane flock)
import * as THREE from 'three';
import * as S from '../shaders.js';
import { bake, mulberry, clamp, lerp, sstep, damp } from '../util.js';
import { createFlock } from '../cranes.js';

export function createMountains(ctx) {
  const { TIER, C } = ctx; const rnd = mulberry(20261106);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(42, 1, .1, 220);
  const tU = [];
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: S.skyVert, fragmentShader: S.skyFrag, depthWrite: false, depthTest: false,
    uniforms: { uT: { value: 0 }, uAspect: { value: 1 }, uSun: { value: 1 }, uScroll: { value: 0 }, uPaper: { value: new THREE.Color('#e9e0ce') }, uPaper2: { value: C.paper2 }, uSunC: { value: C.seal } } }));
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
  const TEXW = [512, 768, 1024][TIER], VARS = 3;
  const mountains = new THREE.Group(); scene.add(mountains);
  const jobs = [];
  LAYERS.forEach((L, li) => {
    const th = Math.round(TEXW * L.h / L.w * 1.15 / 8) * 8; const texs = [];
    for (let v = 0; v < VARS; v++) { const seed = rnd() * 10, pk = L.peak * (.5 + rnd() * .7), px = .3 + rnd() * .4, ox = -li * 300 - v * 97;
      jobs.push(() => texs.push(bake(new THREE.ShaderMaterial({ vertexShader: S.bakeVert, fragmentShader: S.mtnFrag, extensions: { derivatives: true }, depthTest: false, depthWrite: false,
        uniforms: { uOrigin: { value: new THREE.Vector3(ox, -1.4, L.z) }, uSize: { value: new THREE.Vector2(L.w, L.h) }, uDist: { value: 5 - L.z }, uSeed: { value: seed }, uPeak: { value: pk }, uPeakX: { value: px },
          uInk: { value: L.ink }, uNear: { value: 8 }, uFar: { value: 95 }, uSnow: { value: L.snow }, uH: { value: L.h }, uFreq: { value: L.freq }, uW: { value: L.w }, uPine: { value: L.pine || 0 }, uPineS: { value: L.ps || 1 },
          uPaper: { value: C.paper }, uInkC: { value: C.ink }, uTint: { value: C.tint } } }), TEXW, th))); }
    let x = X0 + rnd() * L.w * .5, k = 0;
    while (x > X1 - L.w) { const w = L.w * (.8 + rnd() * .4), h = L.h * (.85 + rnd() * .3), kk = k++ % VARS;
      const m = new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.inkTexFrag, transparent: true, depthWrite: false, uniforms: { map: { value: null }, uFlip: { value: rnd() < .5 ? 1 : 0 }, uFade: { value: 1 } } });
      m.userData.tex = () => texs[kk];
      const mesh = new THREE.Mesh(geo, m); mesh.scale.set(w, h, 1); mesh.position.set(x - w / 2, -1.4 + h / 2, L.z + (rnd() - .5) * L.h * .25); mountains.add(mesh); x -= w * L.gap; }
  });
  mountains.children.sort((a, b) => a.position.z - b.position.z).forEach((m, i) => m.renderOrder = -5 + i * .001);
  let mistTex = null;
  jobs.push(() => { mistTex = bake(new THREE.ShaderMaterial({ vertexShader: S.bakeVert, fragmentShader: S.mistBakeFrag, depthTest: false, depthWrite: false, uniforms: { uOrigin: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector2(1, 1) }, uDist: { value: 1 } } }), 512, 128, { mip: false, wrap: true }); });
  const mists = new THREE.Group(); scene.add(mists);
  [-70, -50, -34, -22, -12].forEach((z, i) => { for (let x = X0; x > X1 - 40; x -= 46) {
    const m = new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.mistTexFrag, transparent: true, depthWrite: false, uniforms: { map: { value: null }, uT: { value: 0 }, uSeed: { value: rnd() }, uA: { value: .8 - i * .06 }, uPaper: { value: C.paper } } });
    tU.push(m.uniforms.uT); const mesh = new THREE.Mesh(geo, m); const s = 1 + (-z) / 30; mesh.scale.set(54 * s, 3.2 * s, 1); mesh.position.set(x, -.6 + s * .5 + rnd() * .6, z); mists.add(mesh); } });
  mists.children.forEach(m => { const z = m.position.z; m.renderOrder = -5 + (mountains.children.filter(c => c.position.z < z).length) * .001 + .0005; });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.ShaderMaterial({ vertexShader: S.mtnVert, fragmentShader: S.waterFrag, transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uFlow: { value: .35 }, uPaper: { value: C.paper }, uInkC: { value: C.ink } } }));
  water.rotation.x = -Math.PI / 2; water.position.set(-20, -.25, -30); water.renderOrder = -4.999; scene.add(water); tU.push(water.material.uniforms.uT);
  const flock = createFlock({ count: [10, 18, 26][TIER], tier: TIER, window: 20 }); flock.mesh.renderOrder = 1; scene.add(flock.mesh);

  const KEYS = [[2, 2.4, 11, 0, 2.9], [-9, 1.7, 7, -2.5, 2.3], [-17, 1.25, 4.5, -3, 1.7]];
  const cam = { x: 2, y: 2.4, z: 11, lx: 0, ly: 2.9 }, look = new THREE.Vector3(); let init = false;
  function finish() { mountains.children.forEach(m => m.material.uniforms.map.value = m.material.userData.tex()); mists.children.forEach(m => m.material.uniforms.map.value = mistTex); }
  return {
    id: 'mountains', scene, camera, jobs, finish, dark: 0,
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 58 : 42; camera.updateProjectionMatrix(); sky.material.uniforms.uAspect.value = w / h; },
    update(st) {
      const { t, dt, p, ptr, intro } = st; for (const u of tU) u.value = t;
      const q = clamp(p) * 2, i = Math.min(1, Math.floor(q)), f0 = q - i, f = lerp(f0, f0 * f0 * (3 - 2 * f0), .55);
      const a = KEYS[i], b = KEYS[i + 1]; const ie = 1 - Math.pow(1 - intro, 3);
      const tx = lerp(a[0], b[0], f), ty = lerp(a[1], b[1], f) + (1 - ie) * 1.4, tz = lerp(a[2], b[2], f) + (1 - ie) * 9, tlx = lerp(a[3], b[3], f), tly = lerp(a[4], b[4], f);
      if (!init || st.snap) { Object.assign(cam, { x: tx, y: ty, z: tz, lx: tlx, ly: tly }); init = true; }
      const k = st.k; cam.x = damp(cam.x, tx, k, dt); cam.y = damp(cam.y, ty, k, dt); cam.z = damp(cam.z, tz, k, dt); cam.lx = damp(cam.lx, tlx, k, dt); cam.ly = damp(cam.ly, tly, k, dt);
      camera.position.set(cam.x + ptr.x * .35, cam.y + ptr.y * .2 + Math.sin(t * .25) * .04, cam.z);
      look.set(cam.x + cam.lx + ptr.x * .15, cam.ly + ptr.y * .1, cam.z - 12); camera.lookAt(look); camera.rotation.z += Math.sin(t * .17) * .002;
      sky.material.uniforms.uScroll.value = p * .3; sky.material.uniforms.uSun.value = 1 - sstep(.2, .6, p) * .7;
      const fv = sstep(.18, .5, p); flock.anchor.set(cam.x + 4 - fv * 3 + Math.sin(t * .13) * 2, cam.y + 4.3 + fv * 4.2, cam.z - 21); flock.update(t); // the flock climbs out of frame as the copy column arrives (keeps text clean)
    },
  };
}
