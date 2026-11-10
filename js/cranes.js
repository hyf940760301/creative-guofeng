// Red-crowned crane (丹顶鹤): procedural, instanced. Body/neck/legs are swept tubes; wings are feathered
// (covert panel + black secondaries + fanned primaries) with a two-joint (shoulder + wrist) flap/glide cycle.
import * as THREE from 'three';
import { sweep, merge, mulberry, clamp, sstep } from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function tri(P, N, C, S, W, a, b, c, col, wing, n = [0, 1, 0]) {
  for (const v of [a, b, c]) { P.push(v[0], v[1], v[2]); N.push(...n); C.push(col); S.push(Math.abs(v[0])); W.push(wing); }
}
function quad(P, N, C, S, W, a, b, c, d, col, wing) { tri(P, N, C, S, W, a, b, c, col, wing); tri(P, N, C, S, W, a, c, d, col, wing); }

function buildCrane(detail = 1) {
  const parts = [];
  const tube = (pts, radii, seg, col, sy = 1, sx = 1) => { const g = sweep(pts, radii, seg, sy, sx); const n = g.attributes.position.count;
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(new Float32Array(n).fill(col), 1)); g.setAttribute('aSpan', new THREE.Float32BufferAttribute(new Float32Array(n), 1)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(new Float32Array(n), 1)); parts.push(g); return g; };
  const seg = detail ? 12 : 7;
  // body: elliptical, slightly arched
  const bodyC = new THREE.CatmullRomCurve3([V(0, .02, -.5), V(0, .03, -.3), V(0, .02, -.05), V(0, .01, .18), V(0, .03, .34)]);
  const bp = bodyC.getPoints(detail ? 16 : 8); tube(bp, bp.map((_, i) => { const t = i / (bp.length - 1); return .03 + Math.sin(Math.pow(t, .8) * Math.PI) * .13; }), seg, 0, .82, 1);
  // neck (black front), S-curve forward
  const neckC = new THREE.CatmullRomCurve3([V(0, .03, .3), V(0, .06, .5), V(0, .09, .72), V(0, .1, .92), V(0, .11, 1.02)]);
  const np = neckC.getPoints(detail ? 14 : 6); tube(np, np.map((_, i) => .052 - i / (np.length - 1) * .024), seg - 2, 1);
  // head: black face, red crown on top, pale beak
  const head = new THREE.SphereGeometry(1, seg, seg >> 1).toNonIndexed(); head.scale(.038, .034, .058); head.translate(0, .116, 1.05);
  { const p = head.attributes.position, n = p.count, col = new Float32Array(n); for (let i = 0; i < n; i++) col[i] = (p.getY(i) > .128 && p.getZ(i) < 1.075) ? 2 : 1;
    head.setAttribute('aCol', new THREE.BufferAttribute(col, 1)); head.setAttribute('aSpan', new THREE.BufferAttribute(new Float32Array(n), 1)); head.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(n), 1)); parts.push(head); }
  tube([V(0, .112, 1.09), V(0, .106, 1.19), V(0, .098, 1.27)], [.017, .01, .002], 6, 3);
  // legs trailing behind, with feet
  for (const s of [-1, 1]) { const lp = [V(s * .035, -.05, -.22), V(s * .03, -.07, -.5), V(s * .025, -.09, -.95), V(s * .022, -.1, -1.2)]; tube(lp, [.016, .012, .01, .009], 5, 3);
    tube([V(s * .022, -.1, -1.2), V(s * .03, -.11, -1.3)], [.012, .004], 4, 3); }
  // tail: black tertial "bustle" drooping over the tail
  const P = [], N = [], C = [], S = [], W = [];
  for (let k = 0; k < (detail ? 7 : 4); k++) { const a = (k / 6 - .5) * .9; const x0 = Math.sin(a) * .06, x1 = Math.sin(a) * .2;
    tri(P, N, C, S, W, [x0 - .03, .07, -.3], [x0 + .03, .07, -.3], [x1, -.02 - Math.abs(a) * .05, -.68], 1, 0); }
  // wings (left = -1, right = +1), built flat in y=0; span along x
  for (const s of [-1, 1]) {
    const L = (x, z) => [s * x, 0, z];
    // covert panel (white): shoulder → wrist → hand base
    quad(P, N, C, S, W, L(.07, .14), L(.62, .17), L(.62, -.1), L(.07, -.1), 0, s);
    quad(P, N, C, S, W, L(.62, .17), L(.98, .1), L(.95, -.06), L(.62, -.1), 0, s);
    // black secondaries along the trailing edge of the arm (individual pointed feathers)
    const ns = detail ? 9 : 5;
    for (let k = 0; k < ns; k++) { const x0 = .07 + k / ns * .56, x1 = .07 + (k + 1) / ns * .56 + .02, len = .25 - k * .006;
      quad(P, N, C, S, W, L(x0, -.08), L(x1, -.08), L(x1 - .01, -.08 - len), L(x0 + .015, -.1 - len * .95), 1, s); }
    // primaries: fanned, slotted "fingers" at the tip (white)
    const np2 = detail ? 7 : 4;
    for (let k = 0; k < np2; k++) { const f = k / (np2 - 1); const bx = .64 + f * .3, bz = -.06 + f * .1; const ang = -.55 + f * .75; const len = .5 + Math.sin(f * Math.PI) * .12;
      const tx = bx + Math.cos(ang) * len, tz = bz + Math.sin(ang) * len, w = .055;
      const nx = -Math.sin(ang) * w, nz = Math.cos(ang) * w;
      quad(P, N, C, S, W, L(bx - nx * .6, bz - nz * .6), L(bx + nx * .6, bz + nz * .6), L(tx + nx * .3, tz + nz * .3), L(tx - nx * .25, tz - nz * .25), k === 0 ? 1 : 0, s);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 1)); g.setAttribute('aSpan', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 1)); parts.push(g);
  const m = merge(parts); const out = new THREE.InstancedBufferGeometry(); for (const k in m.attributes) out.setAttribute(k, m.attributes[k]); return out;
}

const VERT = /* glsl */`
uniform float uT;attribute float aCol,aSpan,aWing,aPhase;varying vec3 vN,vWp;varying float vCol,vSpan;
mat2 R(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
void main(){vec3 p=position,n=normal;
  float ph=uT*(2.6+aPhase*.7)+aPhase*31.;
  float glide=smoothstep(.35,.75,sin(uT*.31+aPhase*17.)*.5+.5);            // long glides between flapping bouts
  float amp=mix(1.,.08,glide);
  float a1=(sin(ph)*.62+.12)*amp+glide*.1;                                  // shoulder
  float a2=(sin(ph-1.1)*.5-.05)*amp-glide*.06;                              // wrist lags the shoulder (fold on upstroke)
  if(abs(aWing)>.5){float s=aWing;vec2 q=vec2(abs(p.x)-.07,p.y);vec2 qn=vec2(abs(n.x),n.y);
    if(q.x>.55){vec2 d=q-vec2(.55,0.);d=R(-a2)*d;q=vec2(.55,0.)+d;qn=R(-a2)*qn;}
    q=R(-a1)*q;qn=R(-a1)*qn;p.x=s*(q.x+.07);p.y=q.y;n.x=s*qn.x;n.y=qn.y;}
  p.y-=sin(ph)*.035*amp;                                                    // body heave
  vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);vWp=w.xyz;vN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*n);
  vCol=aCol;vSpan=aSpan;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FRAG = /* glsl */`
uniform vec3 uLight,uSky,uGround,uFog,uTint;uniform float uFogN,uFogF,uRim;varying vec3 vN,vWp;varying float vCol,vSpan;
void main(){vec3 alb=vCol<.5?vec3(.95,.94,.91):vCol<1.5?vec3(.07,.065,.06):vCol<2.5?vec3(.78,.1,.08):vec3(.32,.3,.27);
  vec3 N=normalize(vN);if(!gl_FrontFacing)N=-N;vec3 V=normalize(cameraPosition-vWp);
  float hemi=N.y*.5+.5;vec3 amb=mix(uGround,uSky,hemi);float dif=max(dot(N,normalize(uLight)),0.);
  // feather striations on white wing panels
  float fe=vCol<.5&&vSpan>.08?.94+.06*sin(vSpan*140.):1.;
  float rim=pow(1.-abs(dot(N,V)),3.)*uRim;
  vec3 col=alb*fe*(amb*.75+dif*.55*uTint)+rim*uTint*.35;
  float f=smoothstep(uFogN,uFogF,length(vWp-cameraPosition));
  gl_FragColor=vec4(mix(col,uFog,f),1.);}`;

export function createFlock({ count, tier, seed = 4242, window = 18, light = { dir: [-.4, .8, .3], sky: [.9, .88, .84], ground: [.55, .52, .48], fog: [.92, .89, .83], tint: [1, .97, .92], fogN: 12, fogF: 70, rim: .4 } }) {
  const geo = buildCrane(tier > 0 ? 1 : 0);
  const r = mulberry(seed); const ph = new Float32Array(count); for (let i = 0; i < count; i++) ph[i] = r();
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uLight: { value: new THREE.Vector3(...light.dir) }, uSky: { value: new THREE.Color(...light.sky) }, uGround: { value: new THREE.Color(...light.ground) },
      uFog: { value: new THREE.Color(...light.fog) }, uTint: { value: new THREE.Color(...light.tint) }, uFogN: { value: light.fogN }, uFogF: { value: light.fogF }, uRim: { value: light.rim } } });
  const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.frustumCulled = false;
  const birds = []; const placed = [];
  for (let i = 0; i < count; i++) { let o, tries = 0;
    do { o = [r() * window, (r() - .5) * 2.6, (r() - .5) * 4.5]; tries++; } while (tries < 40 && placed.some(q => Math.hypot(q[1] - o[1], q[2] - o[2]) < .6 && Math.abs(q[0] - o[0]) < 1.8));
    placed.push(o); birds.push({ x0: o[0], y0: o[1], z0: o[2], sp: .55 + r() * .35, f1: .25 + r() * .2, f2: .3 + r() * .25, f3: .2 + r() * .2, p1: r() * 6.28, p2: r() * 6.28, p3: r() * 6.28, s: .5 + r() * .25 }); }
  const anchor = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _sc = new THREE.Vector3();
  let spread = 1, dirSign = -1, scaleMul = 1;
  // pure function of (anchor, t): deterministic for capture, never "lost" on scroll jumps
  function update(t) {
    mat.uniforms.uT.value = t;
    for (let i = 0; i < count; i++) { const b = birds[i];
      const raw = b.x0 - t * b.sp, x = ((raw % window) + window) % window - window / 2;
      const edge = Math.min(x + window / 2, window / 2 - x), vis = sstep(0, 2.4, edge);
      const wy = Math.sin(t * b.f1 + b.p1) * .45 + Math.sin(t * b.f2 * 1.7 + b.p2) * .18, wz = Math.sin(t * b.f3 + b.p3) * .9;
      const dy = Math.cos(t * b.f1 + b.p1) * .45 * b.f1 + Math.cos(t * b.f2 * 1.7 + b.p2) * .18 * b.f2 * 1.7, dz = Math.cos(t * b.f3 + b.p3) * .9 * b.f3;
      _p.set(anchor.x + x, anchor.y + (b.y0 + wy) * spread, anchor.z + (b.z0 + wz) * spread);
      _f.set(dirSign * b.sp, dy, dz).normalize();
      const bank = clamp(-dz * 1.6, -.5, .5) * -dirSign; _u.set(Math.sin(bank) * .6, 1, 0).normalize();
      _q.copy(_p).add(_f); _m.lookAt(_q, _p, _u);
      const sc = b.s * vis * scaleMul; _sc.set(sc, sc, sc); _m.scale(_sc); _m.setPosition(_p); mesh.setMatrixAt(i, _m); }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, mat, anchor, update, set spread(v) { spread = v; }, set scale(v) { scaleMul = v; } };
}
