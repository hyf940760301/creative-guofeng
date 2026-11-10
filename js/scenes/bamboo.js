// S7 · 竹月 — bamboo grove at night: large textured moon with halo, instanced bamboo culms with nodes and
// moon-rim light swaying in the wind, leaf sprays, drifting fireflies (additive), ground mist.
import * as THREE from 'three';
import { FS_BACK } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';

const SKY = /* glsl */`uniform vec2 uMoon,uAsp;uniform sampler2D uN;varying vec2 vUv;void main(){vec2 uv=vUv;
  vec3 c=mix(vec3(.10,.14,.19),vec3(.03,.045,.07),smoothstep(.1,1.,uv.y));
  vec2 d=(uv-uMoon)*vec2(uAsp.x,1.);float r=length(d);float R=.12;
  c+=vec3(.55,.6,.62)*exp(-r*r*14.)*.35+vec3(.6,.62,.6)*exp(-r*4.)*.12;
  if(r<R){vec2 m=d/R;float z=sqrt(max(0.,1.-dot(m,m)));float n=texture2D(uN,m*.35+.5).r*.6+texture2D(uN,m*.9+.2).a*.4;
    vec3 mc=vec3(.95,.93,.86)*(.82+.18*z)*(.86+.2*smoothstep(.35,.7,n));c=mix(c,mc,smoothstep(R,R-.003,r));}
  gl_FragColor=vec4(c,1.);}`;
const CULM_V = /* glsl */`uniform float uT;attribute vec4 aP;varying vec3 vN,vW;varying float vY,vH,vFar;
void main(){vec3 p=position;float H=aP.z;vY=p.y*H;vH=H;
  vec3 w=vec3(aP.x+p.x*aP.w,vY,aP.y+p.z*aP.w);float sway=sin(uT*.6+aP.x*.7)*.6+sin(uT*1.3+aP.y)*.25;w.x+=sway*pow(p.y,2.)*.9;w.z+=sway*pow(p.y,2.)*.3;
  vN=normalize(vec3(p.x,0.,p.z));vW=w;vFar=-aP.y;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
const CULM_F = /* glsl */`uniform vec3 uMoonDir;varying vec3 vN,vW;varying float vY,vH,vFar;void main(){vec3 n=normalize(vN);
  float seg=fract(vY/1.25);float node=smoothstep(.04,0.,seg)+smoothstep(.97,1.,seg)*.6;
  vec3 V=normalize(cameraPosition-vW);float rim=pow(1.-max(dot(n,V),0.),2.5)*max(dot(n,normalize(uMoonDir)),0.);
  vec3 c=vec3(.07,.1,.09)*(.7+.5*max(dot(n,normalize(uMoonDir)),0.))+rim*vec3(.55,.62,.6)*.7;
  c=mix(c,vec3(.02,.03,.03),node*.7);c+=node*rim*.3;
  float f=smoothstep(6.,40.,length(vW-cameraPosition));c=mix(c,vec3(.09,.13,.17),f*.85);gl_FragColor=vec4(c,1.);}`;
const LEAF_V = /* glsl */`uniform float uT;attribute vec4 aL;attribute float aA;varying float vF;varying vec2 vUv;
void main(){vUv=uv;vec3 p=position;float ca=cos(aA),sa=sin(aA);p=vec3(p.x*ca-p.y*sa,p.x*sa+p.y*ca,p.z+p.x*p.x*.4);
  vec3 w=aL.xyz+p*aL.w;float sway=sin(uT*.6+aL.x*.7)*.6+sin(uT*1.3+aL.z)*.25;float k=pow(clamp(aL.y/9.,0.,1.),2.);w.x+=sway*k*.9+sin(uT*3.+aA*9.)*.03;w.z+=sway*k*.3;
  vF=smoothstep(6.,40.,length(w-cameraPosition));gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`;
const LEAF_F = /* glsl */`varying float vF;varying vec2 vUv;void main(){float e=abs(vUv.y-.5)*2.;float sh=1.-smoothstep(sin(vUv.x*3.14159)*.95-.05,sin(vUv.x*3.14159),e);if(sh<.5)discard;
  vec3 c=mix(vec3(.05,.08,.07),vec3(.18,.24,.22),vUv.x*.6);gl_FragColor=vec4(mix(c,vec3(.09,.13,.17),vF*.85),1.);}`;
const FLY_V = /* glsl */`uniform float uT,uPR,uLate;attribute vec4 aR;varying float vA;void main(){vec3 p=aR.xyz;float s=aR.w*40.;
  p+=vec3(sin(uT*.31+s)*1.2,sin(uT*.47+s*1.3)*.6+uLate*(.6+aR.w*1.4),cos(uT*.27+s)*1.);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  float bl=smoothstep(.2,1.,sin(uT*(1.3+aR.w)+s)*.5+.5);gl_PointSize=uPR*(5.+aR.w*6.)*(1.+uLate*.6)*(8./-mv.z);vA=bl*(1.+uLate*.9);}`;
const FLY_F = /* glsl */`varying float vA;void main(){float d=length(gl_PointCoord-.5);float g=exp(-d*d*28.)+exp(-d*d*200.);gl_FragColor=vec4(vec3(.85,1.,.55)*g*vA,1.);}`;
const MIST_F = /* glsl */`uniform sampler2D uN;uniform float uT;varying vec2 vUv;void main(){float n=texture2D(uN,vUv*vec2(2.,.6)+vec2(uT*.006,0.)).r;
  float a=smoothstep(.3,.75,n)*smoothstep(0.,.4,vUv.y)*smoothstep(1.,.5,vUv.y)*.35;gl_FragColor=vec4(.35,.42,.48,a);}`;

export function createBamboo(ctx) {
  const { TIER, noise, renderer } = ctx; const rnd = mulberry(12);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(44, 1, .1, 120);
  const moonDir = new THREE.Vector3(.3, .6, -1);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: SKY, depthWrite: false, depthTest: false, uniforms: { uMoon: { value: new THREE.Vector2(.64, .7) }, uAsp: { value: new THREE.Vector2(1, 1) }, uN: { value: noise } } }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const NC = [40, 80, 120][TIER]; const cg = new THREE.CylinderGeometry(1, 1, 1, TIER ? 10 : 7, 24, true); cg.translate(0, .5, 0);
  const ig = new THREE.InstancedBufferGeometry(); for (const k in cg.attributes) ig.setAttribute(k, cg.attributes[k]); ig.setIndex(cg.index);
  const ap = new Float32Array(NC * 4); const tops = [];
  for (let i = 0; i < NC; i++) { const z = -2 - Math.pow(rnd(), .7) * 34, x = (rnd() - .5) * (14 + (-z) * 1.4); if (Math.abs(x - 1.5) < 1.6 && z > -8) { i--; continue; }
    const H = 9 + rnd() * 7, r = .07 + rnd() * .06; ap.set([x, z, H, r], i * 4); tops.push([x, H, z]); }
  for (const [i, v] of [[0, [-.1, -.9, 15, .16]], [1, [3.6, -1.6, 15, .13]], [2, [-.9, -2.6, 14, .11]]]) { ap.set(v, i * 4); tops[i] = [v[0], v[2], v[1]]; } // near framing layer
  ig.setAttribute('aP', new THREE.InstancedBufferAttribute(ap, 4)); ig.instanceCount = NC;
  const culms = new THREE.Mesh(ig, new THREE.ShaderMaterial({ vertexShader: CULM_V, fragmentShader: CULM_F, uniforms: { uT: { value: 0 }, uMoonDir: { value: moonDir } } })); culms.frustumCulled = false; scene.add(culms);
  // leaf sprays: clusters of lanceolate blades near the upper culm
  const leafG = new THREE.PlaneGeometry(1, .16, 4, 1); leafG.translate(.5, 0, 0);
  const NL = NC * [10, 16, 22][TIER]; const lg = new THREE.InstancedBufferGeometry(); for (const k in leafG.attributes) lg.setAttribute(k, leafG.attributes[k]); lg.setIndex(leafG.index);
  const al = new Float32Array(NL * 4), aa = new Float32Array(NL);
  for (let i = 0; i < NL; i++) { const tp = tops[i % NC]; const hy = tp[1] * (.45 + rnd() * .55); const side = rnd() < .5 ? -1 : 1;
    al.set([tp[0] + side * (.2 + rnd() * .9), hy + (rnd() - .5) * .6, tp[2] + (rnd() - .5) * .6, .5 + rnd() * .4], i * 4); aa[i] = (side < 0 ? Math.PI : 0) + (rnd() - .5) * 1.2 - side * .4; }
  lg.setAttribute('aL', new THREE.InstancedBufferAttribute(al, 4)); lg.setAttribute('aA', new THREE.InstancedBufferAttribute(aa, 1)); lg.instanceCount = NL;
  const leaves = new THREE.Mesh(lg, new THREE.ShaderMaterial({ vertexShader: LEAF_V, fragmentShader: LEAF_F, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } } })); leaves.frustumCulled = false; scene.add(leaves);
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(80, 6), new THREE.ShaderMaterial({ vertexShader: /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: MIST_F, transparent: true, depthWrite: false, uniforms: { uN: { value: noise }, uT: { value: 0 } } }));
  mist.position.set(0, 1.2, -12); mist.renderOrder = 3; scene.add(mist);
  const NF = [30, 60, 90][TIER]; const fg = new THREE.BufferGeometry(); const fa = new Float32Array(NF * 4);
  for (let i = 0; i < NF; i++) { fa.set([(rnd() - .5) * 18, .4 + rnd() * 4, -1 - rnd() * 16, rnd()], i * 4); }
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NF * 3), 3)); fg.setAttribute('aR', new THREE.BufferAttribute(fa, 4));
  const flies = new THREE.Points(fg, new THREE.ShaderMaterial({ vertexShader: FLY_V, fragmentShader: FLY_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uPR: { value: 1 }, uLate: { value: 0 } } })); flies.frustumCulled = false; flies.renderOrder = 10; scene.add(flies);
  const cam = { y: 1.6, z: 6, p: 0 }; let init = false;
  return {
    id: 'bamboo', scene, camera, dark: 1, jobs: [], finish() {},
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 60 : 44; camera.updateProjectionMatrix(); sky.material.uniforms.uAsp.value.set(w / h, 1); flies.material.uniforms.uPR.value = renderer.getPixelRatio(); },
    update(st) {
      const { t, dt, p, ptr } = st; culms.material.uniforms.uT.value = t; leaves.material.uniforms.uT.value = t; flies.material.uniforms.uT.value = t; flies.material.uniforms.uLate.value = sstep(.6, 1, p); mist.material.uniforms.uT.value = t;
      const ty = lerp(1.4, 2.6, p), tz = lerp(7, 1.5, p), tp = lerp(.05, .32, sstep(.1, 1, p));
      if (!init || st.snap) { Object.assign(cam, { y: ty, z: tz, p: tp }); init = true; }
      cam.y = damp(cam.y, ty, st.k, dt); cam.z = damp(cam.z, tz, st.k, dt); cam.p = damp(cam.p, tp, st.k, dt);
      camera.position.set(1.5 + ptr.x * .5, cam.y + ptr.y * .25, cam.z); camera.rotation.set(cam.p + ptr.y * .03, -ptr.x * .04 - .05, 0);
      sky.material.uniforms.uMoon.value.set(.66, .62 + p * .08);
    },
  };
}
