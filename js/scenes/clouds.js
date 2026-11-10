// S3 · 云海 — 一览众山小: a crane's-eye rise up and over a near ridge, revealing granite pillar clusters (黄山-like)
// standing out of a layered sea of clouds, receding through many ranges to the horizon. Real heightfield geometry
// shaded as ink: axe-cut 皴 streaks on cliffs, pale ledges, inked contours, pines clinging to ledges, aerial perspective.
import * as THREE from 'three';
import { FS_BACK } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';
import { createFlock } from '../cranes.js';

const SKY = /* glsl */`uniform vec2 uSun;uniform float uAsp;varying vec2 vUv;
void main(){vec2 uv=vUv;float h=uv.y;
  vec3 zen=vec3(.76,.79,.82),mid=vec3(.86,.875,.88),hor=vec3(.87,.88,.885);   // horizon meets the aerial-perspective fog without a seam
  vec3 c=mix(hor,mid,smoothstep(.3,.6,h));c=mix(c,zen,smoothstep(.6,1.,h));
  float d=length((uv-uSun)*vec2(uAsp,1.));
  c+=vec3(1.,.86,.64)*exp(-d*d*6.)*.42+vec3(1.,.95,.85)*exp(-d*2.6)*.2;
  c=mix(c,vec3(1.,.98,.93),smoothstep(.04,.034,d)*.85);
  gl_FragColor=vec4(c,1.);}`;
const PK_V = /* glsl */`varying vec3 vW,vN;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=mat3(modelMatrix)*normal;gl_Position=projectionMatrix*viewMatrix*w;}`;
const PK_F = /* glsl */`uniform sampler2D uN;uniform vec3 uInk,uPaper,uFog,uSunDir,uCloud;uniform float uAir,uCun,uT;varying vec3 vW,vN;
void main(){vec3 n=normalize(vN);vec3 V=normalize(cameraPosition-vW);float d=length(cameraPosition-vW);
  float slope=1.-clamp(n.y,0.,1.);
  vec2 tw=abs(n.xz)+1e-3;tw/=tw.x+tw.y;                                                    // biplanar mapping on the cliff faces (stable)
  #define CS(c,ky,ch) (texture2D(uN,vec2(vW.z*(c),vW.y*(ky))).ch*tw.x+texture2D(uN,vec2(vW.x*(c),vW.y*(ky))).ch*tw.y)
  float s1=CS(.45,.022,r),s2=CS(1.1,.05,g),s3=CS(.13,.009,b);
  float cun=smoothstep(-.15,.45,(s1-.5)*7.+(s3-.7)*.8)*(.5+.5*smoothstep(.45,.55,s2));                                  // long vertical axe-cut strokes
  float crev=smoothstep(.06,0.,abs((s2-.5)*7.-.35));                                  // fine fissures
  float mot=texture2D(uN,vW.xz*.045).b*.6+texture2D(uN,vW.xz*.16).a*.4;
  float cliff=smoothstep(.2,.6,slope);
  float lam=max(dot(n,normalize(vec3(-.55,.62,.55))),0.);                                 // painter's key light from upper left
  float wetp=smoothstep(.35,.75,texture2D(uN,vW.xy*vec2(.03,.012)+vW.z*.01).a);
  float ink=mix(.06+.2*smoothstep(.45,.8,mot),.66+.34*(1.-lam)+.14*wetp,cliff);
  ink=max(ink,cliff*min(1.,cun*1.1*uCun+crev*.8*uCun));ink-=cliff*lam*smoothstep(.55,.8,(s2-.5)*5.+.5)*.35*uCun;   // dry axe-cut highlights on the lit faces
  ink*=mix(.6,1.15,smoothstep(0.,30.,vW.y));                                              // ink gathers toward the crests
  float rim=1.-abs(dot(n,V));ink=max(ink,smoothstep(.72,.95,rim)*1.);                   // inked contour at the silhouette
  float foot=smoothstep(-1.,6.,vW.y);ink*=mix(.15,1.,foot);
  vec3 col=mix(uPaper,uInk,clamp(ink,0.,1.));
  float air=1.-exp(-d*uAir*.62);col=mix(col,uFog,clamp(air,0.,.9));
  col=mix(col,uCloud,(1.-foot)*.55);
  float mb=texture2D(uN,vec2(vW.x*.008+uT*.0025,vW.z*.012)).r,mb2=texture2D(uN,vec2(vW.x*.02-uT*.003,vW.z*.02+.5)).g;
  float by=6.+mb*12.;col=mix(col,uCloud,exp(-pow((vW.y-by)/(1.6+mb2*2.),2.))*smoothstep(.35,.7,mb2)*.6);   // mist belts wrapping the pillars
  gl_FragColor=vec4(col,1.);}`;
const CL_V = /* glsl */`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const CL_F = /* glsl */`uniform sampler2D uN;uniform float uT,uTh,uA,uSc,uSp;uniform vec3 uSunDir,uLit,uShade,uFog;varying vec3 vW;
float F(vec2 p){vec2 q=p*uSc;return texture2D(uN,q*.006+vec2(uT*.0016*uSp,uT*.0005)).r*.5+texture2D(uN,q*.017+vec2(-uT*.0026*uSp,.3)).g*.3+texture2D(uN,q*.05+vec2(uT*.004*uSp,.7)).b*.2;}
void main(){vec2 p=vW.xz;float n=F(p),nx=F(p+vec2(2.,0.)),nz=F(p+vec2(0.,2.));
  float den=smoothstep(uTh,uTh+.22,n);if(uA<.99&&den<.01)discard;
  vec3 N=normalize(vec3((n-nx)*14.,1.,(n-nz)*14.));vec3 L=normalize(uSunDir);
  float lit=clamp(dot(N,L)*.7+.35,0.,1.);
  vec3 c=mix(uShade,uLit,smoothstep(.15,.85,lit)*(.55+.45*smoothstep(.3,.8,n)));
  float rimS=den*(1.-den)*4.*max(dot(normalize(vec2(nx-n,nz-n)+1e-5),-normalize(L.xz)),0.);c+=vec3(1.,.95,.84)*rimS*.18;  // sunward edges glow
  float d=length(vW-cameraPosition);c=mix(c,uFog,clamp(1.-exp(-d*.0065),0.,.95));
  gl_FragColor=vec4(c,uA<.99?den*uA*(1.-smoothstep(260.,420.,d)):1.);}`;
const PINE_V = /* glsl */`attribute vec4 aP;varying vec2 vUv;varying float vD;varying float vS;
void main(){vUv=uv;vS=fract(aP.w*7.3);vec4 mv=viewMatrix*vec4(aP.xyz,1.);mv.xy+=vec2(position.x,position.y+.5)*aP.w;vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
const PINE_F = /* glsl */`uniform vec3 uInk,uFog;varying vec2 vUv;varying float vD;varying float vS;
void main(){vec2 p=vUv;float lean=(vS-.5)*.25*p.y;float x=p.x-.5-lean;
  float tr=smoothstep(.022,.008,abs(x+sin(p.y*7.+vS*6.)*.02))*step(p.y,.82);
  float t=0.;for(int k=0;k<4;k++){float fk=float(k);float y0=.36+fk*.15,w=.42-fk*.085;float dy=p.y-y0+x*x*.9;
    t=max(t,smoothstep(.045,.02,abs(dy))*smoothstep(w,w*.6,abs(x+(fk-1.5)*.03*(vS-.5))));}
  float a=max(tr,t);if(a<.3)discard;float air=1.-exp(-vD*.009);gl_FragColor=vec4(mix(uInk,uFog,clamp(air,0.,.9)),1.);}`;
const PUFF_V = /* glsl */`varying vec2 vUv;varying float vD;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
const PUFF_F = /* glsl */`uniform sampler2D uN;uniform float uT,uSeed;uniform vec3 uFog,uLit,uShade;varying vec2 vUv;varying float vD;
void main(){vec2 c=vUv-vec2(.5,.38);float env=smoothstep(.5,.12,length(c*vec2(1.,1.7)));
  float n=texture2D(uN,vUv*vec2(1.3,.8)+uSeed+vec2(uT*.004,0.)).r*.7+texture2D(uN,vUv*3.2+uSeed).a*.3;
  float a=smoothstep(.34,.62,n*env*1.6);if(a<.01)discard;
  vec3 col=mix(uShade,uLit,smoothstep(.2,.8,vUv.y+n*.35));
  float f=1.-exp(-vD*.0065);gl_FragColor=vec4(mix(col,uFog,clamp(f,0.,.9)),a*.85*smoothstep(4.,14.,vD));}`;

// ---- CPU height functions (deterministic) ----
function vnoise(seed) { const P = new Uint8Array(512); const r = mulberry(seed); const b = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } for (let i = 0; i < 512; i++) P[i] = b[i & 255];
  const V = new Float32Array(256).map(() => r());
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, c) => V[P[(P[a & 255] + c) & 511]]; const a0 = h(xi, yi), a1 = h(xi + 1, yi), b0 = h(xi, yi + 1), b1 = h(xi + 1, yi + 1);
    return (a0 + (a1 - a0) * u) + ((b0 + (b1 - b0) * u) - (a0 + (a1 - a0) * u)) * v; }; }
const N2 = vnoise(77);
const fbm = (x, y, o = 5) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * N2(x * f, y * f); f *= 2.03; a *= .5; } return s; };
const ridged = (x, y, o = 5) => { let s = 0, a = .55, f = 1, w = 1; for (let i = 0; i < o; i++) { let n = 1 - Math.abs(N2(x * f + 31, y * f + 17) * 2 - 1); n *= n * w; w = clamp(n * 1.6); s += n * a; f *= 2.1; a *= .5; } return s; };

function buildField({ cx, cz, sx, sz, rx, rz, seed, pillars, base, sink = 9, terr = 2.6, hero }) {
  const r = mulberry(seed); const P = []; if (hero) P.push([0, 0, hero.r, hero.h, hero.sp]);
  for (let i = 0; i < pillars.n; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * pillars.spread; P.push([Math.cos(a) * d * sx * .5, Math.sin(a) * d * sz * .5, pillars.r[0] + r() * (pillars.r[1] - pillars.r[0]), pillars.h[0] + r() * (pillars.h[1] - pillars.h[0]), r() < .55 ? .8 + r() * .9 : 0]); }
  const g = new THREE.PlaneGeometry(sx, sz, rx, rz); g.rotateX(-Math.PI / 2); const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); const ex = x / (sx * .5), ez = z / (sz * .5);
    const env = clamp(1 - Math.pow(Math.max(Math.abs(ex), Math.abs(ez)), 3)); const wx = (x + cx) * .045, wz = (z + cz) * .045;
    let h = ridged(wx, wz) * base * env + fbm(wx * 2, wz * 2, 3) * 2.5;
    for (const [px, pz, pr, ph, sp] of P) { const n = fbm((x - px) * .3 + seed, (z - pz) * .3, 3); const dd = Math.hypot(x - px, z - pz) + (n - .5) * pr * 1.1;
      if (dd < pr * 1.4) { const u = clamp(dd / pr); let c;
        if (sp > 0) c = ph * (1 - Math.pow(u, sp)) * clamp((1 - u) / .18);                 // spire: tapering to a broken point
        else c = ph * clamp((pr - dd) / (pr * .22)) * (1 - u * u * .12);                     // column: sheer sides, a crown of blocks
        c += (fbm((x - px) * 1.1, (z - pz) * 1.1 + seed, 2) - .5) * ph * .14 * clamp(c / ph * 3);
        if (c > ph * .7) c -= Math.floor(ridged((x - px) * .9 + seed, (z - pz) * .9, 3) * 4) / 4 * ph * .22 * sstep(.7, .95, c / ph);   // broken, stepped crowns
        const tq = Math.floor(c / terr) * terr; c = lerp(c, tq + terr * sstep(.55, 1, (c - tq) / terr), .5); // ledges / joints
        h = Math.max(h, c + n * 1.5); } }
    pos.setY(i, h * env + (env - 1) * 14 - sink); }
  g.computeVertexNormals(); g.translate(cx, 0, cz); return g;
}

export function createClouds(ctx) {
  const { TIER, noise } = ctx; const rnd = mulberry(31);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(48, 1, .5, 900);
  const fog = new THREE.Color(.86, .875, .885), sunDir = new THREE.Vector3(.42, .13, -1);
  const ink = new THREE.Color(.13, .14, .16), paper = new THREE.Color(.93, .915, .87), cloudLit = new THREE.Color(.975, .965, .935), cloudSh = new THREE.Color(.79, .8, .82);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: SKY, depthWrite: false, depthTest: false, uniforms: { uSun: { value: new THREE.Vector2(.66, .5) }, uAsp: { value: 1 } } }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const peakMat = (air, cun = 1) => new THREE.ShaderMaterial({ vertexShader: PK_V, fragmentShader: PK_F, uniforms: { uN: { value: noise }, uInk: { value: ink }, uPaper: { value: paper }, uFog: { value: fog }, uSunDir: { value: sunDir }, uCloud: { value: cloudLit }, uAir: { value: air }, uCun: { value: cun }, uT: pkT } });
  const Q = [.55, .8, 1][TIER]; const pkT = { value: 0 };
  const FIELDS = [ // near ridge the camera rises over, then pillar clusters, then ranges to the horizon
    { cx: 0, cz: 12, sx: 110, sz: 34, rx: 180, rz: 56, seed: 3, pillars: { n: 14, spread: .85, r: [2, 4.5], h: [8, 16] }, base: 7, air: .0035, sink: 2 },
    { cx: -34, cz: -32, sx: 56, sz: 50, rx: 120, rz: 108, seed: 5, pillars: { n: 18, spread: .8, r: [1.8, 4.2], h: [16, 32] }, base: 9, air: .0042 },
    { cx: 30, cz: -48, sx: 56, sz: 50, rx: 120, rz: 108, seed: 7, pillars: { n: 20, spread: .8, r: [1.8, 4.6], h: [18, 36] }, base: 9, air: .0042 },
    { cx: -4, cz: -84, sx: 70, sz: 56, rx: 110, rz: 90, seed: 11, pillars: { n: 20, spread: .85, r: [2.2, 5.5], h: [20, 40] }, base: 10, air: .0046 },
    { cx: 6, cz: -58, sx: 40, sz: 40, rx: 130, rz: 130, seed: 41, pillars: { n: 6, spread: .7, r: [2.5, 4.5], h: [24, 36] }, hero: { r: 10, h: 50, sp: 2.2 }, base: 7, air: .0032 },
    { cx: -66, cz: -110, sx: 70, sz: 60, rx: 80, rz: 70, seed: 13, pillars: { n: 10, spread: .8, r: [3.5, 7], h: [20, 36] }, base: 10, air: .005 },
    { cx: 62, cz: -122, sx: 70, sz: 60, rx: 80, rz: 70, seed: 17, pillars: { n: 10, spread: .8, r: [3.5, 7], h: [22, 40] }, base: 10, air: .005 },
    { cx: 0, cz: -190, sx: 420, sz: 70, rx: 150, rz: 26, seed: 19, pillars: { n: 22, spread: .95, r: [5, 10], h: [22, 50] }, base: 16, air: .0042, cun: .6 },
    { cx: 30, cz: -280, sx: 620, sz: 80, rx: 150, rz: 22, seed: 23, pillars: { n: 18, spread: .95, r: [7, 14], h: [20, 48] }, base: 24, air: .0036, cun: .4 },
    { cx: -40, cz: -390, sx: 800, sz: 90, rx: 140, rz: 18, seed: 29, pillars: { n: 10, spread: .95, r: [10, 20], h: [18, 40] }, base: 34, air: .003, cun: .3 },
  ];
  const peaks = new THREE.Group(); scene.add(peaks); const pineSpots = [];
  const jobs = FIELDS.map((F, fi) => () => {
    const g = buildField({ ...F, rx: Math.max(16, Math.round(F.rx * Q)), rz: Math.max(12, Math.round(F.rz * Q)) });
    const m = new THREE.Mesh(g, peakMat(F.air, F.cun ?? 1)); peaks.add(m);
    if (fi >= 1 && fi < 7) {   /* pines only on the pillar clusters (the near ridge passes too close for a sprite to hold up) */ const P = g.attributes.position, N = g.attributes.normal; const r = mulberry(100 + fi);
      for (let i = 0; i < P.count; i += 3) { if (N.getY(i) > .8 && P.getY(i) > 4 && r() < .16) pineSpots.push([P.getX(i), P.getY(i), P.getZ(i), (fi === 0 ? 1.2 : 2.1) + r() * 1.4]); } }
  });
  let pines = null;
  jobs.push(() => { const max = [200, 380, 560][TIER]; const sp = pineSpots.length > max ? pineSpots.filter((_, i) => i % Math.ceil(pineSpots.length / max) === 0) : pineSpots;
    const pg = new THREE.PlaneGeometry(1, 1); const ig = new THREE.InstancedBufferGeometry(); ig.index = pg.index; ig.setAttribute('position', pg.attributes.position); ig.setAttribute('uv', pg.attributes.uv);
    const a = new Float32Array(sp.length * 4); sp.forEach((s, i) => a.set(s, i * 4)); ig.setAttribute('aP', new THREE.InstancedBufferAttribute(a, 4)); ig.instanceCount = sp.length;
    pines = new THREE.Mesh(ig, new THREE.ShaderMaterial({ vertexShader: PINE_V, fragmentShader: PINE_F, uniforms: { uInk: { value: ink }, uFog: { value: fog } } })); pines.frustumCulled = false; pines.renderOrder = 1; scene.add(pines); });
  // layered sea of clouds: an opaque floor + two drifting translucent layers above it, flowing between the peaks
  const tU = [pkT]; const clouds = [];
  for (const [y, th, a, sc, sp, ro] of [[0, .2, 1, 1, 1, 2], [3.2, .5, .78, 1.35, 1.6, 3], [7.5, .6, .5, 2.1, 2.4, 4]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 900), new THREE.ShaderMaterial({ vertexShader: CL_V, fragmentShader: CL_F, transparent: a < 1, depthWrite: a >= 1,
      uniforms: { uN: { value: noise }, uT: { value: 0 }, uTh: { value: th }, uA: { value: a }, uSc: { value: sc }, uSp: { value: sp }, uSunDir: { value: sunDir }, uLit: { value: cloudLit }, uShade: { value: cloudSh }, uFog: { value: fog } } }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, y, -300); m.renderOrder = ro; scene.add(m); clouds.push(m); tU.push(m.material.uniforms.uT); }
  const puffs = new THREE.Group(); scene.add(puffs);
  for (let i = 0; i < [8, 14, 20][TIER]; i++) { const z = -15 - rnd() * 130, s = 9 + rnd() * 16;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 2.2, s), new THREE.ShaderMaterial({ vertexShader: PUFF_V, fragmentShader: PUFF_F, transparent: true, depthWrite: false, uniforms: { uN: { value: noise }, uT: { value: 0 }, uSeed: { value: rnd() * 5 }, uFog: { value: fog }, uLit: { value: cloudLit }, uShade: { value: cloudSh } } }));
    m.position.set((rnd() - .5) * 150, 2 + s * .22, z); puffs.add(m); tU.push(m.material.uniforms.uT); }
  puffs.children.sort((a, b) => a.position.z - b.position.z).forEach((m, i) => m.renderOrder = 4.5 + i * .01);
  const flock = createFlock({ count: [10, 16, 22][TIER], tier: TIER, seed: 991, window: 26, light: { dir: [.3, .5, -1], sky: [.93, .93, .91], ground: [.7, .71, .74], fog: [.86, .875, .885], tint: [1, .97, .92], fogN: 25, fogF: 200, rim: .8 } });
  flock.mesh.renderOrder = 6; scene.add(flock.mesh);
  // crane's-eye path: from just under the near ridge's crest, rising up and over it, then looking down across the ranges
  const K = [[0, 9.5, 46, 0, 10.5, -10, 50], [3, 22, 30, 2, 12, -40, 47], [-3, 42, 14, 2, 10, -90, 46]];
  const cam = { x: 0, y: 9.5, z: 46, lx: 0, ly: 10.5, lz: -10, f: 50 }; let init = false; const look = new THREE.Vector3(); let asp = 1;
  return {
    id: 'clouds', scene, camera, dark: 0, jobs, finish() {},
    resize(w, h) { asp = w / h; camera.aspect = asp; camera.updateProjectionMatrix(); sky.material.uniforms.uAsp.value = asp; },
    update(st) {
      const { t, dt, p, ptr } = st; for (const u of tU) u.value = t;
      const q = clamp(p) * 2, i = Math.min(1, Math.floor(q)), f0 = q - i, f = f0 * f0 * (3 - 2 * f0); const A = K[i], B = K[i + 1];
      const T = A.map((v, k) => lerp(v, B[k], f));
      if (!init || st.snap) { Object.assign(cam, { x: T[0], y: T[1], z: T[2], lx: T[3], ly: T[4], lz: T[5], f: T[6] }); init = true; }
      const k = st.k; cam.x = damp(cam.x, T[0], k, dt); cam.y = damp(cam.y, T[1], k, dt); cam.z = damp(cam.z, T[2], k, dt); cam.lx = damp(cam.lx, T[3], k, dt); cam.ly = damp(cam.ly, T[4], k, dt); cam.lz = damp(cam.lz, T[5], k, dt); cam.f = damp(cam.f, T[6], k, dt);
      const fov = (asp < .8 ? cam.f + 12 : cam.f); if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.position.set(cam.x + ptr.x * 1.2 + Math.sin(t * .11) * .6, cam.y + ptr.y * .6 + Math.sin(t * .23) * .25, cam.z);
      look.set(cam.lx + ptr.x * .6, cam.ly + ptr.y * .4, cam.lz); camera.lookAt(look); camera.rotation.z += Math.sin(t * .17) * .006 + (cam.x - T[0]) * .01;
      _s.set(sunDir.x * 400 + camera.position.x, sunDir.y * 400 + camera.position.y, sunDir.z * 400 + camera.position.z).project(camera); sky.material.uniforms.uSun.value.set(_s.x * .5 + .5, _s.y * .5 + .5);
      // cranes glide below the lens, across the cloud sea, for scale
      flock.anchor.set(lerp(16, -14, p) + Math.sin(t * .1) * 2, cam.y - lerp(3, 7, p), cam.z - lerp(16, 22, p)); flock.update(t);
    },
  };
}
const _s = new THREE.Vector3();
