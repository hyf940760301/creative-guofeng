// S6 · 寒江 — snowy river panned sideways like an unrolled handscroll; lone fisherman's boat (lofted hull,
// woven canopy, straw-cloaked figure), reeds, falling snow, distant snowy ridges; pointer ripples on the water.
import * as THREE from 'three';
import * as SH from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp, bake } from '../util.js';

const SKY = /* glsl */`varying vec2 vUv;void main(){vec3 c=mix(vec3(.80,.81,.80),vec3(.90,.90,.88),vUv.y);gl_FragColor=vec4(c,1.);}`;
const GROUND_V = /* glsl */`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const GROUND_F = /* glsl */`uniform sampler2D uN,uRip;uniform float uT;uniform vec2 uRes;varying vec3 vW;
float rc(float x){return -9.+sin(x*.07)*3.5+sin(x*.19+1.)*1.2;}
void main(){vec2 p=vW.xz;float c=rc(p.x),w=2.6+sin(p.x*.13)*.6;float d=abs(p.y-c)-w;
  float n=texture2D(uN,p*.05).r,n2=texture2D(uN,p*.3).a;
  float bank=smoothstep(.0,.35,d+(n-.5)*.9);
  vec3 snow=vec3(.94,.94,.93)*(.94+n2*.06);
  // dry-brush bank stroke where snow meets water
  float rim=smoothstep(.5,.0,abs(d+(n-.5)*.9-.15))*smoothstep(.3,.7,n2);
  vec2 su=gl_FragCoord.xy/uRes;vec2 rip=texture2D(uRip,su).rg;float rr=(rip.r-rip.g);
  float lane=p.y*4.+n*2.+rr*6.;float st=smoothstep(.1,0.,abs(fract(lane)-.5)-.04)*smoothstep(.3,.7,texture2D(uN,vec2(p.x*.03+uT*.004,floor(lane)*.17)).g);
  vec3 water=mix(vec3(.40,.42,.43),vec3(.62,.64,.64),smoothstep(-w,w*.6,-abs(p.y-c)));
  water=mix(water,vec3(.24,.25,.26),st*.4);water+=clamp(rr*4.,-.15,.25);
  vec3 col=mix(water,snow,bank);col=mix(col,vec3(.16,.16,.16),rim*.55);
  float f=smoothstep(10.,90.,length(vW-cameraPosition));col=mix(col,vec3(.86,.86,.85),f);gl_FragColor=vec4(col,1.);}`;
const RIP_F = /* glsl */`uniform sampler2D uPrev;uniform vec2 uPx,uPtr;uniform float uImp,uAsp;varying vec2 vUv;
void main(){vec2 s=texture2D(uPrev,vUv).rg;float h=(texture2D(uPrev,vUv+vec2(uPx.x,0.)).r+texture2D(uPrev,vUv-vec2(uPx.x,0.)).r+texture2D(uPrev,vUv+vec2(0.,uPx.y)).r+texture2D(uPrev,vUv-vec2(0.,uPx.y)).r)*.5-s.g;
  h*=.985;vec2 d=(vUv-uPtr)*vec2(uAsp,1.);h+=uImp*exp(-dot(d,d)/.00012);gl_FragColor=vec4(h,s.r,0.,1.);}`;
const SNOW_V = /* glsl */`uniform float uT,uPR,uCx;attribute vec4 aR;varying float vA;void main(){vec3 p=aR.xyz;float sp=.6+aR.w*.8;
  p.y=mod(p.y-uT*sp,14.)-2.;p.x+=sin(uT*.6+aR.w*40.)*.35+uCx;p.x=uCx+mod(p.x-uCx+30.,60.)-30.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  gl_PointSize=uPR*(1.2+aR.w*2.4)*(10./-mv.z);vA=smoothstep(60.,6.,-mv.z);}`;
const SNOW_F = /* glsl */`varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(1.,1.,1.,vA*(1.-d*2.)*.9);}`;
const LIT_V = /* glsl */`varying vec3 vN,vW;varying vec2 vUv;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const LIT_F = /* glsl */`uniform vec3 uCol;uniform float uSnow,uWeave,uStraw;varying vec3 vN,vW;varying vec2 vUv;
void main(){vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;float l=dot(n,normalize(vec3(-.3,.8,.5)))*.5+.5;vec3 c=uCol*(.55+.6*l);
  if(uWeave>0.){float w=step(.5,fract(vUv.x*40.+step(.5,fract(vUv.y*18.))*.5));c*=.85+.25*w;}
  if(uStraw>0.){float s=fract(vUv.x*60.+sin(vUv.y*30.)*.2);c*=.8+.3*smoothstep(.3,.7,s);}
  if(uCol.r<.3&&uWeave==0.&&uStraw==0.){c*=.9+.15*sin(vW.y*90.);}           // plank lines on the hull
  c=mix(c,vec3(.97),smoothstep(.55,.85,n.y)*uSnow);                          // snow settles on upward faces
  float f=smoothstep(10.,90.,length(vW-cameraPosition));gl_FragColor=vec4(mix(c,vec3(.86,.86,.85),f),1.);}`;

function hull() { // lofted hull: U sections along x with a rising sheer at bow/stern
  const NX = 40, NJ = 14, P = [], idx = [];
  for (let i = 0; i <= NX; i++) { const x = -1.3 + i / NX * 2.6, u = x / 1.3; const w = .34 * Math.pow(Math.max(0, 1 - u * u), .55) + .01, d = .2 * Math.pow(Math.max(0, 1 - u * u), .35), top = .1 + .3 * Math.pow(Math.abs(u), 3.2);
    for (let j = 0; j <= NJ; j++) { const a = (j / NJ - .5) * Math.PI; P.push(x, top - (top + d) * Math.cos(a) * (1 - Math.abs(Math.sin(a)) * .0), Math.sin(a) * w); } }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NJ; j++) { const a = i * (NJ + 1) + j, b = a + NJ + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
  const uv = new Float32Array((NX + 1) * (NJ + 1) * 2); for (let i = 0; i <= NX; i++) for (let j = 0; j <= NJ; j++) { uv[(i * (NJ + 1) + j) * 2] = i / NX; uv[(i * (NJ + 1) + j) * 2 + 1] = j / NJ; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
function boat() {
  const g = new THREE.Group(); const M = (col, o = {}) => new THREE.ShaderMaterial({ vertexShader: LIT_V, fragmentShader: LIT_F, side: THREE.DoubleSide, uniforms: { uCol: { value: new THREE.Color(...col) }, uSnow: { value: o.snow || 0 }, uWeave: { value: o.weave || 0 }, uStraw: { value: o.straw || 0 } } });
  g.add(new THREE.Mesh(hull(), M([.16, .14, .12], { snow: .3 })));
  const canopy = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .8, 28, 1, true, -Math.PI / 2, Math.PI), M([.42, .36, .26], { snow: 1, weave: 1 })); canopy.rotation.z = Math.PI / 2; canopy.position.set(-.35, .12, 0); canopy.scale.set(1, 1, 1.05); g.add(canopy);
  const fig = new THREE.Group(); fig.position.set(.55, .1, 0); g.add(fig);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(.17, .42, 18, 4, true), M([.36, .32, .24], { snow: .8, straw: 1 })); cloak.position.y = .2; fig.add(cloak);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.055, 14, 10), M([.5, .42, .36])); head.position.y = .44; fig.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(.2, .1, 28, 1, true), M([.48, .4, .28], { snow: 1, straw: 1 })); hat.position.y = .51; fig.add(hat);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(.006, .012, 2.2, 6), M([.12, .1, .08])); rod.position.set(.95, .55, .15); rod.rotation.z = -1.0; rod.rotation.x = .2; g.add(rod);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.9, 1.08, .35), new THREE.Vector3(2.05, -.15, .35)]), new THREE.LineBasicMaterial({ color: 0x555555, transparent: true, opacity: .6 })); g.add(line);
  return g;
}
export function createSnow(ctx) {
  const { TIER, noise, renderer, C, CAPTURE } = ctx; const rnd = mulberry(66);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(40, 1, .1, 200);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: SH.FS_BACK, fragmentShader: SKY, depthWrite: false, depthTest: false })); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  // ripple sim (screen space)
  const RS = [128, 192, 256][TIER]; const mk = () => new THREE.WebGLRenderTarget(RS, RS, { type: THREE.HalfFloatType, depthBuffer: false });
  let rA = mk(), rB = mk(); const ripMat = new THREE.ShaderMaterial({ vertexShader: SH.FS_VERT, fragmentShader: RIP_F, uniforms: { uPrev: { value: null }, uPx: { value: new THREE.Vector2(1 / RS, 1 / RS) }, uPtr: { value: new THREE.Vector2(-1, -1) }, uImp: { value: 0 }, uAsp: { value: 1 } } });
  const rs = new THREE.Scene(), rc = new THREE.Camera(); const rq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ripMat); rq.frustumCulled = false; rs.add(rq);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), new THREE.ShaderMaterial({ vertexShader: GROUND_V, fragmentShader: GROUND_F, uniforms: { uN: { value: noise }, uRip: { value: rA.texture }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } } }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(40, 0, -40); scene.add(ground);
  // distant snowy ridges (baked with the ink-mountain shader, heavy snow, pale ink)
  const ridges = new THREE.Group(); scene.add(ridges); const texs = [];
  const jobs = [0, 1].map(v => () => texs.push(bake(new THREE.ShaderMaterial({ vertexShader: SH.bakeVert, fragmentShader: SH.mtnFrag, extensions: { derivatives: true },
    uniforms: { uOrigin: { value: new THREE.Vector3(v * 77, -1.4, -50) }, uSize: { value: new THREE.Vector2(40, 12) }, uDist: { value: 50 }, uSeed: { value: 3 + v * 4 }, uPeak: { value: .8 }, uPeakX: { value: .45 }, uInk: { value: .55 }, uNear: { value: 8 }, uFar: { value: 95 }, uSnow: { value: 1.6 }, uH: { value: 12 }, uFreq: { value: 2.6 }, uW: { value: 40 }, uPine: { value: .25 }, uPineS: { value: 1.2 }, uPaper: { value: new THREE.Color(.9, .9, .88) }, uInkC: { value: new THREE.Color(.2, .2, .21) }, uTint: { value: new THREE.Color(.6, .63, .66) } } }), 1024, 320)));
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.ShaderMaterial({ vertexShader: SH.mtnVert, fragmentShader: SH.inkTexFrag, transparent: true, depthWrite: false, uniforms: { map: { value: null }, uFlip: { value: i % 2 }, uFade: { value: 1 }, uWL: { value: -1e3 }, uNight: { value: 0 } } }));
    m.position.set(-20 + i * 26, 4, -55 - (i % 2) * 10); m.userData.v = i % 2; m.renderOrder = -5 + (i % 2 ? 0 : .01); ridges.add(m); }
  // reeds along the banks (instanced thin blades)
  const NR = [150, 300, 500][TIER]; const rg = new THREE.PlaneGeometry(.025, 1, 1, 4); rg.translate(0, .5, 0);
  const reeds = new THREE.InstancedMesh(rg, new THREE.ShaderMaterial({ vertexShader: /* glsl */`uniform float uT;varying float vY;void main(){vec3 p=position;vY=uv.y;vec4 w=instanceMatrix*vec4(p,1.);w.x+=sin(uT*1.1+w.z+w.x*.4)*.05*uv.y*uv.y;gl_Position=projectionMatrix*viewMatrix*modelMatrix*w;}`,
    fragmentShader: /* glsl */`varying float vY;void main(){gl_FragColor=vec4(mix(vec3(.2,.19,.17),vec3(.45,.42,.36),vY),1.);}`, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } } }), NR);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); for (let i = 0; i < NR; i++) { const x = rnd() * 110 - 10, side = rnd() < .5 ? -1 : 1, c = -9 + Math.sin(x * .07) * 3.5 + Math.sin(x * .19 + 1) * 1.2, w = 2.6 + Math.sin(x * .13) * .6;
    const z = c + side * (w + rnd() * .8 - .3); e.set((rnd() - .5) * .3, rnd() * 3, (rnd() - .5) * .4); q.setFromEuler(e); const s = .5 + rnd() * .9; m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, s, 1)); reeds.setMatrixAt(i, m); } }
  scene.add(reeds);
  const b = boat(); b.position.set(30, .02, -9 + Math.sin(30 * .07) * 3.5 + Math.sin(30 * .19 + 1) * 1.2); b.rotation.y = .25; scene.add(b);
  const NS = [500, 1100, 1800][TIER]; const sg = new THREE.BufferGeometry(); const sa = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) { sa[i * 4] = rnd() * 60 - 30; sa[i * 4 + 1] = rnd() * 14; sa[i * 4 + 2] = -rnd() * 40 + 4; sa[i * 4 + 3] = rnd(); }
  sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3)); sg.setAttribute('aR', new THREE.BufferAttribute(sa, 4));
  const snow = new THREE.Points(sg, new THREE.ShaderMaterial({ vertexShader: SNOW_V, fragmentShader: SNOW_F, transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uPR: { value: 1 }, uCx: { value: 0 } } })); snow.frustumCulled = false; snow.renderOrder = 20; scene.add(snow);
  const cam = { x: 0 }; let init = false; const lastP = new THREE.Vector2(-1, -1); let live = 0;
  return {
    id: 'snow', scene, camera, dark: 0, jobs, finish() { ridges.children.forEach(m => m.material.uniforms.map.value = texs[m.userData.v]); ripMat.uniforms.uPrev.value = rA.texture; renderer.setRenderTarget(rB); renderer.render(rs, rc); renderer.setClearColor(0, 0); for (const r of [rA, rB]) { renderer.setRenderTarget(r); renderer.clear(); } renderer.setRenderTarget(null); /* warm ripple program (zero impulse) */ },
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 56 : 40;
      // lens shift: lift river + ridges into the free upper band above the workflow cards (verticals stay vertical)
      if (w / h > 1) camera.setViewOffset(w, h, 0, h * .2, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix(); ripMat.uniforms.uAsp.value = w / h; const pr = renderer.getPixelRatio(); ground.material.uniforms.uRes.value.set(w * pr, h * pr); snow.material.uniforms.uPR.value = pr; },
    click(u, v) { ripMat.uniforms.uPtr.value.set(u, v); ripMat.uniforms.uImp.value = 1.4; live = 240; return true; },
    update(st) {
      const { t, dt, p, ptr } = st; ground.material.uniforms.uT.value = t; reeds.material.uniforms.uT.value = t; snow.material.uniforms.uT.value = t;
      const tx = lerp(4, 48, p);
      if (!init || st.snap) { cam.x = tx; init = true; } cam.x = damp(cam.x, tx, st.k, dt);
      camera.position.set(cam.x + ptr.x * .4, 4.2 + ptr.y * .2, 8); camera.lookAt(cam.x + ptr.x * .15, .6, -9); snow.material.uniforms.uCx.value = cam.x;
      ground.material.uniforms.uRes.value.set(st.rtW, st.rtH);
      b.position.y = .02 + Math.sin(t * 1.2) * .02; b.rotation.z = Math.sin(t * .9) * .02;
      if (CAPTURE) return;
      const su = st.ptrScreen, mv = lastP.x >= 0 ? Math.hypot(su.x - lastP.x, su.y - lastP.y) : 0; lastP.copy(su);
      if (st.pointerIn && mv > .002) { ripMat.uniforms.uPtr.value.copy(su); ripMat.uniforms.uImp.value = clamp(mv * 6, 0, .35); live = 240; }
      if (live <= 0) return; live--;
      ripMat.uniforms.uPrev.value = rA.texture; renderer.setRenderTarget(rB); renderer.render(rs, rc); renderer.setRenderTarget(null); const tmp = rA; rA = rB; rB = tmp;
      ground.material.uniforms.uRip.value = rA.texture; ripMat.uniforms.uImp.value = 0;
    },
  };
}
