// S3 · 云海 — dawn above a sea of clouds; peaks pierce the cloud floor; the crane flock crosses close to the lens.
import * as THREE from 'three';
import { FS_BACK, NOISE } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';
import { createFlock } from '../cranes.js';

const SKY = /* glsl */`uniform vec2 uSun;uniform float uAsp,uRise;varying vec2 vUv;
void main(){vec2 uv=vUv;float h=uv.y;
  vec3 zen=vec3(.64,.70,.80),mid=vec3(.90,.84,.82),hor=vec3(.99,.85,.70);
  vec3 c=mix(hor,mid,smoothstep(.25,.55,h));c=mix(c,zen,smoothstep(.55,1.,h));
  float d=length((uv-uSun)*vec2(uAsp,1.));
  c+=vec3(1.,.72,.42)*exp(-d*d*9.)*.55+vec3(1.,.85,.6)*exp(-d*3.5)*.25;
  c=mix(c,vec3(1.,.97,.9),smoothstep(.052,.046,d));
  gl_FragColor=vec4(c,1.);}`;
const SEA_V = /* glsl */`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const SEA_F = /* glsl */`uniform sampler2D uN;uniform float uT;uniform vec3 uSunDir,uFog;varying vec3 vW;
float H(vec2 p){vec2 a=p*.014+vec2(uT*.002,0.);vec2 b=p*.045+vec2(-uT*.0035,uT*.0015);
  float bil=1.-texture2D(uN,a).b;float r=texture2D(uN,b).r;return bil*.62+r*.38;}
void main(){vec2 p=vW.xz;float e=.5;float h=H(p),hx=H(p+vec2(e,0.)),hz=H(p+vec2(0.,e));
  vec3 n=normalize(vec3((h-hx)*5.,1.,(h-hz)*5.));vec3 L=normalize(uSunDir);
  float lit=clamp(dot(n,L)*.6+.4,0.,1.);
  vec3 V=normalize(cameraPosition-vW);float back=pow(max(dot(-V.xz,normalize(L.xz)),0.),6.)*smoothstep(.3,.8,h); // forward-scatter toward the sun
  vec3 shade=vec3(.70,.71,.82),mid=vec3(.95,.91,.90),hi=vec3(1.,.97,.93);
  vec3 c=mix(shade,mid,smoothstep(.15,.65,lit));c=mix(c,hi,smoothstep(.6,.95,lit)*smoothstep(.4,.8,h));
  c+=vec3(1.,.78,.5)*back*.35;
  c*=.9+.12*smoothstep(.25,.85,h);
  float d=length(vW-cameraPosition);c=mix(c,uFog,smoothstep(12.,150.,d));
  gl_FragColor=vec4(c,1.);}`;
const PEAK_V = /* glsl */`varying vec2 vUv;varying float vD;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
const PEAK_F = NOISE + /* glsl */`uniform sampler2D uN;uniform float uSeed,uSunX,uSea;uniform vec3 uCol,uFog,uRim;varying vec2 vUv;varying float vD;
float hs(float a){return fract(sin(a)*43758.5453);}
float prof(float x){float h=0.;for(int k=0;k<6;k++){float fk=float(k);
  float c=.18+.64*hs(uSeed*13.1+fk*7.3),w=.06+.13*hs(uSeed*3.7+fk*11.1),hh=.3+.7*hs(uSeed*5.3+fk*3.1);
  h=max(h,hh*pow(max(0.,1.-abs(x-c)/w),.85));}return h;}           // clustered granite pinnacles (黄山-like)
void main(){float x=vUv.x,y=vUv.y;
  float h=(prof(x)*.86+.07+fbm1(x*13.+uSeed)*.07+fbm1(x*41.+uSeed*3.)*.025)*smoothstep(0.,.12,x)*smoothstep(1.,.88,x);
  if(y>h)discard;
  float t=(h-y)/max(h,.001);
  float streak=texture2D(uN,vec2(x*7.+uSeed,y*.7)).b,fine=texture2D(uN,vec2(x*23.+uSeed,y*2.5)).a;
  float dens=mix(.92,.18,smoothstep(0.,.8,t))*(.62+streak*.5)*(.85+fine*.3);  // ink gathers at the crest, washes out downward
  vec3 c=mix(uFog,uCol,clamp(dens,0.,1.));
  c=mix(c,uRim,smoothstep(.025,0.,h-y)*.55);                                    // dawn catching the crest
  float a=smoothstep(uSea,uSea+.2,y);                          // foot dissolves into the cloud floor (no hard cut at the sea plane)
  float f=smoothstep(10.,170.,vD);gl_FragColor=vec4(mix(c,uFog,f*.85),a);}`;
const PUFF_V = /* glsl */`varying vec2 vUv;varying float vD;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
const PUFF_F = /* glsl */`uniform sampler2D uN;uniform float uT,uSeed;uniform vec3 uFog;varying vec2 vUv;varying float vD;
void main(){vec2 c=vUv-vec2(.5,.35);float env=smoothstep(.5,.1,length(c*vec2(1.,1.6)));
  float n=texture2D(uN,vUv*vec2(1.2,.8)+uSeed+vec2(uT*.003,0.)).r*.7+texture2D(uN,vUv*3.+uSeed).a*.3;
  float a=smoothstep(.35,.6,n*env*1.6);if(a<.01)discard;
  vec3 col=mix(vec3(.66,.63,.75),vec3(1.,.93,.84),smoothstep(.2,.85,vUv.y+n*.3));
  float f=smoothstep(10.,140.,vD);gl_FragColor=vec4(mix(col,uFog,f*.8),a*(1.-f*.4));}`;

export function createClouds(ctx) {
  const { TIER, noise } = ctx; const rnd = mulberry(31);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(46, 1, .1, 400);
  const fog = new THREE.Color(.97, .85, .74), sunDir = new THREE.Vector3(.2, .25, -1);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: SKY, depthWrite: false, depthTest: false, uniforms: { uSun: { value: new THREE.Vector2(.62, .42) }, uAsp: { value: 1 }, uRise: { value: 0 } } }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), new THREE.ShaderMaterial({ vertexShader: SEA_V, fragmentShader: SEA_F, uniforms: { uN: { value: noise }, uT: { value: 0 }, uSunDir: { value: sunDir }, uFog: { value: fog } } }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0, -150); scene.add(sea);
  const peaks = new THREE.Group(); scene.add(peaks);
  for (let i = 0; i < 9; i++) { const z = -40 - rnd() * 120, h = 14 + rnd() * 22, w = h * (1.6 + rnd());
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({ vertexShader: PEAK_V, fragmentShader: PEAK_F, transparent: true, depthWrite: false, 
      uniforms: { uN: { value: noise }, uSeed: { value: rnd() * 10 }, uSunX: { value: 1 }, uSea: { value: 5 / h }, uCol: { value: new THREE.Color(.22, .24, .32) }, uFog: { value: fog }, uRim: { value: new THREE.Color(1, .86, .68) } } }));
    const x = (rnd() - .5) * 200; m.position.set(x, h / 2 - 5, z); peaks.add(m); }
  const puffs = new THREE.Group(); scene.add(puffs); const tU = [sea.material.uniforms.uT];
  for (let i = 0; i < [8, 14, 20][TIER]; i++) { const z = -20 - rnd() * 110, s = 10 + rnd() * 18;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 2, s), new THREE.ShaderMaterial({ vertexShader: PUFF_V, fragmentShader: PUFF_F, transparent: true, depthWrite: false, uniforms: { uN: { value: noise }, uT: { value: 0 }, uSeed: { value: rnd() * 5 }, uFog: { value: fog } } }));
    m.position.set((rnd() - .5) * 160, s * .25 - 1, z); m.renderOrder = 2; puffs.add(m); tU.push(m.material.uniforms.uT); }
  [...peaks.children, ...puffs.children].sort((a, b) => a.position.z - b.position.z).forEach((m, i) => m.renderOrder = 1 + i * .01); // back-to-front across peaks + puffs
  const flock = createFlock({ count: [10, 16, 22][TIER], tier: TIER, seed: 991, window: 26, light: { dir: [.3, .5, -1], sky: [.95, .86, .82], ground: [.72, .66, .74], fog: [.97, .85, .74], tint: [1, .86, .7], fogN: 25, fogF: 160, rim: 1.1 } });
  flock.mesh.renderOrder = 5; scene.add(flock.mesh);
  const cam = { x: 0, y: 7, z: 30, r: 0 }; let init = false; const look = new THREE.Vector3();
  return {
    id: 'clouds', scene, camera, dark: 0, jobs: [], finish() {},
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 62 : 46; camera.updateProjectionMatrix(); sky.material.uniforms.uAsp.value = w / h; },
    update(st) {
      const { t, dt, p, ptr } = st; for (const u of tU) u.value = t;
      const tz = lerp(34, 6, p), ty = lerp(9, 5.5, p) , tr = Math.sin(p * Math.PI) * .05;
      if (!init || st.snap) { cam.z = tz; cam.y = ty; cam.r = tr; init = true; }
      cam.z = damp(cam.z, tz, st.k, dt); cam.y = damp(cam.y, ty, st.k, dt); cam.r = damp(cam.r, tr, st.k, dt);
      camera.position.set(ptr.x * .8, cam.y + ptr.y * .4, cam.z); look.set(ptr.x * .3, cam.y - 1.2 + p * 1.5, cam.z - 20); camera.lookAt(look); camera.rotation.z += cam.r + Math.sin(t * .2) * .004;
      sky.material.uniforms.uSun.value.set(.64, .36 + p * .1); sunDir.set(.2, .18 + p * .1, -1);
      // flock sweeps across in front of the lens as you read
      const near = Math.sin(clamp(p) * Math.PI);
      flock.anchor.set(lerp(10, -8, p), cam.y + 1.5 + near * .5, cam.z - lerp(19, 12, near)); // passes through the sky band above the copy flock.update(t);
    },
  };
}
