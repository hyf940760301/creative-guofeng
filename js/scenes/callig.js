// S5 · 字境 — calligraphy space: the strokes of 「永」 (the eight principles) are written in 3D as you scroll,
// as brush ribbons with pressure, dry-brush streaks and flying-white; loose strokes and splatters float at depth.
import * as THREE from 'three';
import { FS_BACK, NOISE } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';

const BG = /* glsl */`uniform vec2 uAsp;uniform sampler2D uN;varying vec2 vUv;void main(){vec3 c=mix(vec3(.90,.87,.80),vec3(.95,.93,.88),vUv.y);
  float f=texture2D(uN,vUv*vec2(uAsp.x,1.)*3.).a;c*=.97+f*.05;vec2 q=(vUv-.5)*vec2(uAsp.x,1.);c*=1.-.25*dot(q,q);gl_FragColor=vec4(c,1.);}`;
const GRID_V = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const GRID_F = /* glsl */`varying vec2 vUv;uniform float uA;void main(){vec2 p=vUv*2.-1.;float w=.004;
  float l=smoothstep(w,0.,abs(abs(p.x)-.98))+smoothstep(w,0.,abs(abs(p.y)-.98));                  // frame
  float d=(smoothstep(w,0.,abs(p.x))+smoothstep(w,0.,abs(p.y)))*step(fract((p.x+p.y)*12.),.5);    // 田 cross dashed
  float x=(smoothstep(w,0.,abs(p.x-p.y))+smoothstep(w,0.,abs(p.x+p.y)))*step(fract(p.x*12.),.5);  // 米 diagonals dashed
  float a=clamp(l+d*.6+x*.4,0.,1.)*uA;if(a<.01)discard;gl_FragColor=vec4(.7,.18,.12,a*.55);}`;
const STROKE_V = /* glsl */`attribute vec2 aSV;varying vec2 vSV;varying vec3 vW;void main(){vSV=aSV;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const STROKE_F = NOISE + /* glsl */`uniform float uDraw,uSeed,uDry;uniform vec3 uInk;uniform sampler2D uN;varying vec2 vSV;varying vec3 vW;
void main(){float s=vSV.x,v=vSV.y;
  float head=uDraw;if(s>head)discard;
  float tipFade=smoothstep(head,head-.03,s);                                   // wet leading edge
  float edge=1.-abs(v);float rough=texture2D(uN,vec2(s*3.+uSeed,v*.5+.5)).b;
  if(edge<.08+rough*.12)discard;                                                // ragged silhouette
  float streak=texture2D(uN,vec2(v*1.7+uSeed,s*.25)).a;                         // bristle streaks along the stroke
  float speed=sin(s*3.14159);                                                   // fastest mid-stroke → more flying-white
  float fw=smoothstep(.55,.8,streak+speed*uDry*.35-(1.-edge)*.2);
  if(fw>.5&&edge<.75)discard;
  float pool=smoothstep(.85,1.,s)+smoothstep(.12,0.,s);                         // ink pools at the start and end
  vec3 c=mix(uInk,vec3(.32,.30,.28),fw*.6*(1.-pool));
  c=mix(c,uInk*.6,smoothstep(head-.05,head,s)*.5);
  gl_FragColor=vec4(c,(.92+pool*.08)*mix(1.,.85,tipFade));}`;
const SPL_F = /* glsl */`uniform sampler2D uN;uniform float uSeed,uA;uniform vec3 uInk;varying vec2 vUv;void main(){vec2 c=vUv-.5;float r=length(c);float an=atan(c.y,c.x)/6.2831853;
  float lobe=texture2D(uN,vec2(an*2.+uSeed,uSeed*.37)).r;float spike=pow(texture2D(uN,vec2(an*5.+uSeed*1.7,.5)).b,3.);
  float R=.14+lobe*.14+spike*.16;float a=smoothstep(R+.01,R-.01,r);                       // irregular blot with splash spikes
  for(int k=0;k<4;k++){float fk=float(k);float aa=fract(sin(uSeed*9.1+fk*4.7)*437.)*6.2832;vec2 o=vec2(cos(aa),sin(aa))*(.3+.12*fract(fk*.37+uSeed));
    a=max(a,smoothstep(.035,.02,length(c-o))*.9);}                                           // satellite droplets
  float tone=.82+.18*texture2D(uN,vUv*1.3+uSeed).a;
  if(a*uA<.02)discard;gl_FragColor=vec4(uInk*mix(1.,1.25,1.-tone),a*uA*.9);}`;

// 「永」 strokes in a -1..1 box (y up). [points, maxWidth]
const YONG = [
  [[[-.04, .9], [.04, .82], [.1, .72]], .13],                                   // 点
  [[[-.42, .5], [-.1, .52], [.12, .5], [.08, .38], [.08, 0], [.08, -.6], [.08, -.86], [-.05, -.74], [-.16, -.68]], .085], // 横折钩
  [[[-.62, .14], [-.36, .16], [-.2, .15], [-.34, -.08], [-.52, -.3], [-.72, -.44]], .075],                               // 横撇
  [[[.55, .42], [.42, .28], [.26, .14], [.16, .06]], .08],                     // 撇
  [[[.16, .06], [.32, -.14], [.5, -.38], [.66, -.56], [.82, -.64]], .1],       // 捺
];
function ribbon(pts2, wmax, scale, z, seg, rnd, taper = false) {
  const pts = pts2.map(([x, y]) => new THREE.Vector3(x * scale, y * scale, z + (rnd() - .5) * .3));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'); const N = seg; const P = [], SV = [];
  const prof = taper ? (s => wmax * scale * Math.sin(Math.min(1, s * 4) * Math.PI * .5) * Math.pow(1 - s, .7)) : s => { const press = .55 + .45 * Math.sin(Math.min(1, s * 1.6) * Math.PI * .5); const end = s > .85 ? 1 + (s - .85) * 2.2 : 1; const start = Math.min(1, .5 + s * 8); return wmax * scale * press * start * (s > .95 ? (1 - (s - .95) * 12) : end); };
  const tmp = new THREE.Vector3(), nrm = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const L = [], R = [];
  for (let i = 0; i <= N; i++) { const s = i / N; const p = curve.getPointAt(s), tg = curve.getTangentAt(s); nrm.crossVectors(Z, tg).normalize(); const w = Math.max(.002, prof(s));
    L.push([p.clone().addScaledVector(nrm, w), s]); R.push([p.clone().addScaledVector(nrm, -w), s]); }
  for (let i = 0; i < N; i++) { const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1];
    for (const [v, side] of [[a, 1], [b, -1], [c, -1], [a, 1], [c, -1], [d, 1]]) { P.push(v[0].x, v[0].y, v[0].z); SV.push(v[1], side); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aSV', new THREE.Float32BufferAttribute(SV, 2)); return g;
}
export function createCallig(ctx) {
  const { TIER, noise, C } = ctx; const rnd = mulberry(8);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: BG, depthWrite: false, depthTest: false, uniforms: { uAsp: { value: new THREE.Vector2(1, 1) }, uN: { value: noise } } }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.ShaderMaterial({ vertexShader: GRID_V, fragmentShader: GRID_F, transparent: true, depthWrite: false, uniforms: { uA: { value: 0 } } }));
  grid.position.z = -.4; scene.add(grid);
  const seg = [40, 70, 110][TIER]; const strokes = [];
  const mk = (pts, w, scale, z, seed, dry, taper) => { const m = new THREE.ShaderMaterial({ vertexShader: STROKE_V, fragmentShader: STROKE_F, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uDraw: { value: 0 }, uSeed: { value: seed }, uDry: { value: dry }, uInk: { value: C.ink }, uN: { value: noise } } }); const mesh = new THREE.Mesh(ribbon(pts, w, scale, z, seg, rnd, taper), m); scene.add(mesh); strokes.push(mesh); return mesh; };
  YONG.forEach(([pts, w], i) => mk(pts, w, 3, 0, rnd() * 5, 1).userData.win = [.08 + i * .12, .08 + i * .12 + .14]);
  // loose strokes floating at depth around the character
  for (let i = 0; i < [3, 5, 6][TIER]; i++) { const z = -3 - rnd() * 8, x = (rnd() - .5) * 14, y = (rnd() - .5) * 7, a = rnd() * 6.28, L = 1 + rnd() * 2;
    const pts = [[0, 0], [Math.cos(a) * L * .4, Math.sin(a) * L * .4 + .2], [Math.cos(a) * L, Math.sin(a) * L]].map(([px, py]) => [px + x, py + y]);
    const m = mk(pts, .1 + rnd() * .08, 1, z, rnd() * 5, 1.5, true); m.userData.win = [.05 + rnd() * .5, .6 + rnd() * .3]; m.material.uniforms.uInk.value = new THREE.Color().copy(C.ink).lerp(new THREE.Color(.85, .82, .76), .35 + (-z) * .04); }
  const splats = new THREE.Group(); scene.add(splats);
  for (let i = 0; i < 14; i++) { const s = .1 + rnd() * .35; const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.ShaderMaterial({ vertexShader: GRID_V, fragmentShader: SPL_F, transparent: true, depthWrite: false, uniforms: { uN: { value: noise }, uSeed: { value: rnd() * 5 }, uA: { value: 0 }, uInk: { value: C.ink } } }));
    m.position.set((rnd() - .5) * 7, (rnd() - .5) * 5, (rnd() - .5) * 2); m.userData.at = rnd() * .8; splats.add(m); }
  const cam = { a: .5, r: 9, y: -1 }; let init = false;
  return {
    id: 'callig', scene, camera, dark: 0, jobs: [], finish() {},
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 58 : 40; camera.updateProjectionMatrix(); bg.material.uniforms.uAsp.value.set(w / h, 1); },
    update(st) {
      const { dt, p, ptr, t } = st;
      for (const m of strokes) { const [a, b] = m.userData.win; m.material.uniforms.uDraw.value = clamp((p - a) / (b - a)) * 1.001; }
      splats.children.forEach(m => m.material.uniforms.uA.value = sstep(m.userData.at, m.userData.at + .06, p));
      grid.material.uniforms.uA.value = sstep(.02, .2, p);
      // camera swings from a raking side view to frontal as the character completes
      const ta = lerp(.75, .0, sstep(0, .8, p)), tr = lerp(8.5, 10.5, p), ty = lerp(-1.8, 0, sstep(0, .7, p));
      if (!init || st.snap) { cam.a = ta; cam.r = tr; cam.y = ty; init = true; }
      cam.a = damp(cam.a, ta, st.k, dt); cam.r = damp(cam.r, tr, st.k, dt); cam.y = damp(cam.y, ty, st.k, dt);
      const off = camera.aspect < .8 ? 0 : 2.1;
      camera.position.set(Math.sin(cam.a) * cam.r - off + ptr.x * .3, cam.y + ptr.y * .2, Math.cos(cam.a) * cam.r); camera.lookAt(-off, cam.y * .3, 0); camera.rotation.z += Math.sin(t * .2) * .003;
    },
  };
}
