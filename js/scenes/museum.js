// S4 · 鼎器 — dark museum stage: studio-lit bronze ding on a plinth, procedural PMREM environment,
// soft contact shadow, spotlight cone with dust, draggable rotation with inertia, patina presets.
import * as THREE from 'three';
import { FS_BACK } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp } from '../util.js';
import { buildDing } from '../bronze.js';

const BG = /* glsl */`uniform vec2 uAsp;varying vec2 vUv;void main(){vec2 c=(vUv-vec2(.5,.55))*vec2(uAsp.x,1.);float d=length(c);
  vec3 col=mix(vec3(.13,.115,.1),vec3(.025,.022,.02),smoothstep(.0,.9,d));gl_FragColor=vec4(col,1.);}`;
const FLOOR_V = /* glsl */`varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const FLOOR_F = /* glsl */`varying vec3 vW;uniform vec3 uC;void main(){float d=length(vW.xz-uC.xz);
  vec3 col=mix(vec3(.16,.14,.12),vec3(.02,.018,.016),smoothstep(.4,6.,d));
  float sh=1.-.82*exp(-pow(d/.95,2.)*2.2);col*=sh;                         // soft contact shadow
  gl_FragColor=vec4(col,1.-smoothstep(2.2,6.5,d));}`;                     // dissolves into the backdrop: no horizon line
const PLINTH_F = /* glsl */`varying vec3 vW;varying vec3 vN;void main(){vec3 n=normalize(vN);float l=clamp(dot(n,normalize(vec3(-.4,.9,.5)))*.5+.5,0.,1.);
  vec3 c=vec3(.07,.065,.06)*(.5+l*.8);c+=smoothstep(.97,1.,n.y)*.02;gl_FragColor=vec4(c,1.);}`;
const PLINTH_V = /* glsl */`varying vec3 vW;varying vec3 vN;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const CONE_V = /* glsl */`varying vec3 vN,vV;varying float vY;void main(){vY=position.y;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`;
const CONE_F = /* glsl */`uniform float uA;varying vec3 vN,vV;varying float vY;void main(){float f=pow(abs(dot(normalize(vN),normalize(vV))),1.6);
  float a=f*smoothstep(-.5,.4,vY)*smoothstep(.5,.2,vY)*uA;gl_FragColor=vec4(vec3(1.,.9,.75)*a,1.);}`;
const DUST_V = /* glsl */`uniform float uT,uPR;attribute vec4 aR;varying float vA;void main(){vec3 p=aR.xyz;float a=uT*(.05+aR.w*.07)+aR.w*40.;
  p.x+=sin(a)*.25;p.z+=cos(a*1.3)*.25;p.y=mod(p.y+uT*.03*(aR.w-.4),3.2)-.4;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  gl_PointSize=uPR*(1.+aR.w*2.)*(6./-mv.z);float r=length(p.xz);vA=smoothstep(1.4,.2,r+(2.8-p.y)*.25)*.55;}`;
const DUST_F = /* glsl */`varying float vA;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vec3(1.,.9,.7)*vA*(1.-d*2.),1.);}`;

function makeEnv(renderer) { // procedural studio: dark room, key softbox, warm rim strip, top panel
  const s = new THREE.Scene(); const room = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(.012, .011, .01), side: THREE.BackSide })); s.add(room);
  const panel = (w, h, c, pos, look) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(...look); s.add(m); };
  panel(6, 4, new THREE.Color(5, 4.7, 4.3), [-7, 6, 6], [0, 0, 0]);       // key softbox
  panel(1.2, 9, new THREE.Color(5, 3.2, 1.8), [8, 2, -5], [0, 0, 0]);     // warm rim strip
  panel(8, 8, new THREE.Color(1.2, 1.15, 1.1), [0, 12, 0], [0, 0, 0]);    // top
  panel(10, 2, new THREE.Color(.25, .22, .2), [0, -3, 8], [0, 0, 0]);     // floor bounce
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromScene(s, .035); pm.dispose(); return rt.texture;
}

export function createMuseum(ctx) {
  const { TIER, noise, renderer } = ctx; const rnd = mulberry(5);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(32, 1, .05, 60);
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: FS_BACK, fragmentShader: BG, depthWrite: false, depthTest: false, uniforms: { uAsp: { value: new THREE.Vector2(1, 1) } } }));
  bg.frustumCulled = false; bg.renderOrder = -10; scene.add(bg);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShaderMaterial({ vertexShader: FLOOR_V, fragmentShader: FLOOR_F, uniforms: { uC: { value: new THREE.Vector3(0, 0, 0) } }, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.62; scene.add(floor);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.2, .5, 96, 1), new THREE.ShaderMaterial({ vertexShader: PLINTH_V, fragmentShader: PLINTH_F })); plinth.position.y = -.87; plinth.visible = false; scene.add(plinth); // (was coplanar with the floor → z-fighting sunburst)
  floor.position.y = -.62; floor.material.uniforms.uC.value.set(0, 0, 0);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(.35, 1.6, 4.2, 48, 1, true), new THREE.ShaderMaterial({ vertexShader: CONE_V, fragmentShader: CONE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: .09 } } }));
  cone.geometry.translate(0, 0, 0); cone.position.set(0, 1.5, 0); cone.renderOrder = 5; scene.add(cone);
  const ND = [120, 260, 420][TIER]; const dg = new THREE.BufferGeometry(); const ar = new Float32Array(ND * 4);
  for (let i = 0; i < ND; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 1.4; ar[i * 4] = Math.cos(a) * r; ar[i * 4 + 1] = rnd() * 3.2 - .4; ar[i * 4 + 2] = Math.sin(a) * r; ar[i * 4 + 3] = rnd(); }
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ND * 3), 3)); dg.setAttribute('aR', new THREE.BufferAttribute(ar, 4));
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({ vertexShader: DUST_V, fragmentShader: DUST_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uPR: { value: 1 } } }));
  dust.frustumCulled = false; dust.renderOrder = 6; scene.add(dust);
  const key = new THREE.DirectionalLight(0xfff1e0, 2.2); key.position.set(-3, 5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffb070, 2.6); rim.position.set(4, 2, -4); scene.add(rim);
  const pivot = new THREE.Group(); scene.add(pivot);
  let ding = null;
  const jobs = [() => { scene.environment = makeEnv(renderer); }, () => { ding = buildDing({ tier: TIER, noise }); ding.group.position.y = .3; pivot.add(ding.group); }];
  // interaction state: drag rotation with inertia (critically damped toward target)
  const rot = { y: .4, vy: 0, x: 0, tx: 0, drag: false, lx: 0, ly: 0 };
  const cam = { a: 0, r: 5.6, y: .9 }; let init = false; const look = new THREE.Vector3(0, .05, 0);
  let patina = 0, patinaT = 0;
  return {
    id: 'museum', scene, camera, dark: 1, jobs, finish() {},
    get object() { return pivot; },
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 58 : 32; camera.updateProjectionMatrix(); bg.material.uniforms.uAsp.value.set(w / h, 1); dust.material.uniforms.uPR.value = renderer.getPixelRatio(); },
    dragStart(x, y) { rot.drag = true; rot.lx = x; rot.ly = y; rot.vy = 0; },
    dragMove(x, y, dt) { if (!rot.drag) return; const dx = x - rot.lx, dy = y - rot.ly; rot.lx = x; rot.ly = y; rot.y += dx * .008; rot.vy = dx * .008 / Math.max(dt, 1 / 120); rot.tx = clamp(rot.tx + dy * .004, -.35, .35); },
    dragEnd() { rot.drag = false; },
    setPatina(v) { patinaT = v; },
    update(st) {
      const { t, dt, p, ptr } = st; dust.material.uniforms.uT.value = t;
      // camera: low dolly-in, slight orbit as you read; pointer adds parallax
      const ta = lerp(-.35, .3, p), tr = lerp(6.4, 4.6, sstep(0, .6, p)), ty = lerp(1.3, .75, p);
      if (!init || st.snap) { cam.a = ta; cam.r = tr; cam.y = ty; init = true; }
      cam.a = damp(cam.a, ta, st.k, dt); cam.r = damp(cam.r, tr, st.k, dt); cam.y = damp(cam.y, ty, st.k, dt);
      const W2 = camera.aspect < .8; const off = W2 ? 0 : -.95; // vessel sits right of centre on desktop
      camera.position.set(Math.sin(cam.a) * cam.r + off + ptr.x * .15, cam.y + ptr.y * .1, Math.cos(cam.a) * cam.r); look.set(off, W2 ? .6 : .25, 0); camera.lookAt(look);
      if (!rot.drag) { rot.vy *= Math.exp(-dt * 2.2); rot.y += rot.vy * dt; rot.tx = damp(rot.tx, 0, 1.5, dt); }
      if (!rot.drag && !st.capture) rot.y += .12 * dt; // idle turntable accumulates (no jump on drag start/end)
      pivot.rotation.y = rot.y + p * 1.4; pivot.rotation.x = rot.tx; pivot.position.y = Math.sin(t * .7) * .015;
      patina = damp(patina, patinaT, st.capture ? 1e4 : 6, dt); if (ding) ding.mats.forEach(m => m.userData.uPatina.value = patina);
    },
  };
}
