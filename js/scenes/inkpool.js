// S2 · 墨池 — macro inside the ink pool: backlit water, ink plumes blooming & curling (layered, parallax),
// light shafts, suspended motes, plus an interactive dye field (pointer trails, click-to-drop ink).
import * as THREE from 'three';
import { FS_VERT, FS_BACK } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';

const BG = /* glsl */`uniform float uT;uniform vec2 uAsp;varying vec2 vUv;uniform sampler2D uN;
void main(){vec2 uv=vUv;vec3 top=vec3(.95,.96,.95),bot=vec3(.80,.84,.85);vec3 c=mix(bot,top,smoothstep(0.,1.,uv.y));
  float glow=exp(-pow(length((uv-vec2(.62,1.05))*vec2(uAsp.x,1.)),2.)*2.2);c+=glow*vec3(.05,.045,.03);
  // god rays from the surface
  float a=atan(uv.x-.62,1.25-uv.y);float rays=texture2D(uN,vec2(a*.9+uT*.004,.3)).r;rays=smoothstep(.45,.85,rays)*smoothstep(0.,1.,uv.y);
  c+=rays*.06;gl_FragColor=vec4(c,1.);}`;
const PLUME_V = /* glsl */`varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const PLUME_F = /* glsl */`uniform sampler2D uN;uniform float uT,uSeed,uDen,uBloom,uCx,uFog;uniform vec3 uInk,uWater;varying vec2 vUv;varying vec3 vW;
void main(){vec2 uv=vUv;
  // a column of ink falling from the top, spreading as it sinks (bloom drives how far it has fallen)
  float fall=1.-uv.y;float reach=uBloom*1.15;
  float wid=.07+fall*.42;
  vec2 q=vec2((uv.x-uCx)*1.4,uv.y*1.1)+uSeed;
  vec4 n1=texture2D(uN,q*.55+vec2(0.,uT*.006));
  vec2 w=(n1.rg-.5)*.9;
  vec4 n2=texture2D(uN,q*1.1+w+vec2(uT*.003,uT*.011));
  vec4 n3=texture2D(uN,q*2.6+w*1.6-vec2(0.,uT*.017));
  float x=(uv.x-uCx+(n1.r-.5)*.5*fall)/wid;
  float env=exp(-x*x*1.6)*smoothstep(reach,reach-.25,fall)*smoothstep(1.,.96,uv.y)*smoothstep(.0,.3,uv.y)*smoothstep(.0,.12,uv.x)*smoothstep(1.,.88,uv.x); // soft on every edge: no plane borders
  float fil=pow(n3.b,3.)*.9;                                 // filaments
  float cloud=smoothstep(.35,.85,n2.r*.8+n3.a*.4);
  float d=clamp((cloud*.75+fil)*env*uDen,0.,1.);
  // ink in water: dense core near-black, thin wisps cool grey-blue
  vec3 col=mix(vec3(.36,.42,.47),uInk,smoothstep(.15,.8,d));
  col=mix(col,uWater,uFog);
  gl_FragColor=vec4(col,d*(1.-uFog*.6));}`;
const SIM_F = /* glsl */`uniform sampler2D uPrev,uN;uniform vec2 uPtr,uPtrV,uPx;uniform float uSplat,uT,uAsp;uniform vec4 uDrop;varying vec2 vUv;
void main(){vec4 n=texture2D(uN,vUv*1.3+vec2(uT*.01,uT*.004));
  vec2 vel=(n.rg-.5)*.0035+vec2(0.,-.0006);
  vec2 b=vUv-vel;
  float c=texture2D(uPrev,b).r;
  float s=(texture2D(uPrev,b+vec2(uPx.x,0.)).r+texture2D(uPrev,b-vec2(uPx.x,0.)).r+texture2D(uPrev,b+vec2(0.,uPx.y)).r+texture2D(uPrev,b-vec2(0.,uPx.y)).r)*.25;
  float d=mix(c,s,.22)*.9935;
  vec2 dd=(vUv-uPtr)*vec2(uAsp,1.);d+=uSplat*exp(-dot(dd,dd)/.0009)*(.6+n.b*.6);
  vec2 de=(vUv-uDrop.xy)*vec2(uAsp,1.);float r=uDrop.z;d+=uDrop.w*smoothstep(r,r*.3,length(de)+(n.a-.5)*r*.8);
  gl_FragColor=vec4(min(d,1.2),0.,0.,1.);}`;
const DYE_F = /* glsl */`uniform sampler2D uDye,uN;uniform vec3 uInk;uniform float uOn;varying vec2 vUv;
void main(){float d=texture2D(uDye,vUv).r*uOn;if(d<.004)discard;float e=texture2D(uN,vUv*3.).b;
  vec3 col=mix(vec3(.32,.38,.44),uInk,smoothstep(.1,.7,d));gl_FragColor=vec4(col,clamp(d*(1.1+e*.3),0.,.96));}`;
const MOTE_V = /* glsl */`uniform float uT,uPR;attribute vec4 aR;varying float vA;
void main(){vec3 p=aR.xyz;p.y=mod(p.y-uT*(.05+aR.w*.08)+30.,24.)-14.;p.x+=sin(uT*.3+aR.w*30.)*.25;
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=uPR*(1.+aR.w*2.5)*(14./-mv.z);vA=smoothstep(30.,4.,-mv.z)*.5;}`;
const MOTE_F = /* glsl */`varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(.2,.22,.24,vA*(1.-d*2.));}`;

export function createInkPool(ctx) {
  const { TIER, C, noise, renderer, CAPTURE } = ctx; const rnd = mulberry(77);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(48, 1, .1, 100);
  const tU = [];
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: BG, depthWrite: false, depthTest: false,
    uniforms: { uT: { value: 0 }, uAsp: { value: new THREE.Vector2(1, 1) }, uN: { value: noise } } }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg); tU.push(bg.material.uniforms.uT);
  // plume layers at depth (far → near)
  const plumes = []; const NL = [4, 6, 7][TIER];
  for (let i = 0; i < NL; i++) { const z = -22 + i * (18 / NL), f = i / (NL - 1);
    const m = new THREE.ShaderMaterial({ vertexShader: PLUME_V, fragmentShader: PLUME_F, transparent: true, depthWrite: false,
      uniforms: { uN: { value: noise }, uT: { value: 0 }, uSeed: { value: rnd() * 9 }, uDen: { value: lerp(.75, 1.25, f) }, uBloom: { value: 0 }, uCx: { value: .3 + rnd() * .4 }, uFog: { value: lerp(.55, 0, f) }, uInk: { value: C.ink }, uWater: { value: new THREE.Color(.86, .89, .9) } } });
    const h = 9 + (-z) * .9, w = h * 1.1; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    mesh.position.set((rnd() - .5) * w * .5, 1 + rnd() * 2 - (-z) * .05, z); mesh.renderOrder = i; mesh.userData.delay = rnd() * .3; scene.add(mesh); plumes.push(mesh); tU.push(m.uniforms.uT); }
  // suspended motes
  const NM = [200, 500, 800][TIER]; const mg = new THREE.BufferGeometry(); const ar = new Float32Array(NM * 4);
  for (let i = 0; i < NM; i++) { ar[i * 4] = (rnd() - .5) * 30; ar[i * 4 + 1] = (rnd() - .5) * 24; ar[i * 4 + 2] = -2 - rnd() * 24; ar[i * 4 + 3] = rnd(); }
  mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NM * 3), 3)); mg.setAttribute('aR', new THREE.BufferAttribute(ar, 4));
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({ vertexShader: MOTE_V, fragmentShader: MOTE_F, transparent: true, depthWrite: false, uniforms: { uT: { value: 0 }, uPR: { value: 1 } } }));
  motes.frustumCulled = false; motes.renderOrder = 50; scene.add(motes); tU.push(motes.material.uniforms.uT);
  // interactive dye field (ping-pong), screen-space
  const SR = [192, 256, 320][TIER];
  const mk = () => new THREE.WebGLRenderTarget(SR, SR, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  let rA = mk(), rB = mk();
  const simMat = new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: SIM_F, depthTest: false, depthWrite: false,
    uniforms: { uPrev: { value: null }, uN: { value: noise }, uPtr: { value: new THREE.Vector2(-1, -1) }, uPtrV: { value: new THREE.Vector2() }, uPx: { value: new THREE.Vector2(1 / SR, 1 / SR) }, uSplat: { value: 0 }, uT: { value: 0 }, uAsp: { value: 1 }, uDrop: { value: new THREE.Vector4(0, 0, 0, 0) } } });
  const simScene = new THREE.Scene(), simCam = new THREE.Camera(); const sq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMat); sq.frustumCulled = false; simScene.add(sq);
  const dye = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: DYE_F, transparent: true, depthWrite: false, depthTest: false,
    uniforms: { uDye: { value: rA.texture }, uN: { value: noise }, uInk: { value: C.ink }, uOn: { value: CAPTURE ? 0 : 1 } } }));
  dye.frustumCulled = false; dye.renderOrder = 100; scene.add(dye);
  const lastP = new THREE.Vector2(-1, -1); let drop = 0; let simLive = false;
  const cam = { y: 0, z: 4 }; let init = false;
  return {
    id: 'inkpool', scene, camera, dark: 0, jobs: [], finish() { simMat.uniforms.uSplat.value = 0; simMat.uniforms.uPrev.value = rA.texture; renderer.setRenderTarget(rB); renderer.render(simScene, simCam); renderer.setClearColor(0, 0); for (const r of [rA, rB]) { renderer.setRenderTarget(r); renderer.clear(); } renderer.setRenderTarget(null); /* warm sim program */ },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); bg.material.uniforms.uAsp.value.set(w / h, 1); simMat.uniforms.uAsp.value = w / h; motes.material.uniforms.uPR.value = Math.min(renderer.getPixelRatio(), 2); },
    click(u, v) { simMat.uniforms.uDrop.value.set(u, v, .07 + Math.random() * .03, 1.1); drop = 2; return true; },   // renders its own drop: no extra screen blot (it outlived the chapter)
    update(st) {
      const { t, dt, p, ptr } = st; for (const u of tU) u.value = t;
      plumes.forEach((m, i) => { m.material.uniforms.uBloom.value = clamp((p - m.userData.delay * .5) * 1.6 + .25 + Math.sin(t * .1 + i) * .02); });
      const ty = lerp(1.5, -3.2, p), tz = lerp(4.5, 1.5, p);
      if (!init || st.snap) { cam.y = ty; cam.z = tz; init = true; }
      cam.y = damp(cam.y, ty, st.k, dt); cam.z = damp(cam.z, tz, st.k, dt);
      camera.position.set(ptr.x * .6, cam.y + ptr.y * .35, cam.z); camera.lookAt(ptr.x * .2, cam.y - .6, -10); camera.rotation.z = Math.sin(t * .2) * .01;
      // interactive dye — skipped entirely in capture mode (keeps frames deterministic)
      if (CAPTURE) return;
      const su = st.ptrScreen; const moved = lastP.x >= 0 ? Math.hypot(su.x - lastP.x, su.y - lastP.y) : 0;
      simMat.uniforms.uSplat.value = st.pointerIn ? clamp(moved * 9, 0, .5) : 0; simMat.uniforms.uPtr.value.copy(su); lastP.copy(su);
      if (!(simMat.uniforms.uSplat.value > 0 || drop > 0 || simLive)) return;
      simMat.uniforms.uT.value = t; simMat.uniforms.uPrev.value = rA.texture;
      renderer.setRenderTarget(rB); renderer.render(simScene, simCam); renderer.setRenderTarget(null);
      const tmp = rA; rA = rB; rB = tmp; dye.material.uniforms.uDye.value = rA.texture;
      if (drop > 0 && --drop === 0) simMat.uniforms.uDrop.value.w = 0;
      simLive = true;
    },
  };
}
