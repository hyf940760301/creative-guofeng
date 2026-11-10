// S8 · 落款 — finale: a carved soapstone seal descends, presses into the paper and lifts away, leaving a
// red impression that bleeds into the fibres; vermilion ink flecks; then the page settles for pricing & sign-up.
import * as THREE from 'three';
import { FS_BACK, NOISE } from '../shaders.js';
import { mulberry, clamp, lerp, sstep, damp, easeInOut } from '../util.js';

const PAPER_V = /* glsl */`varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const PAPER_F = /* glsl */`uniform sampler2D uN,uStamp;uniform float uInk,uBleed,uShadow;uniform vec2 uSP;varying vec2 vUv;varying vec3 vW;
void main(){vec2 p=vW.xz;float f=texture2D(uN,p*.25).a,f2=texture2D(uN,p*vec2(1.6,.2)).r;
  vec3 c=vec3(.93,.90,.84)*(.95+f*.06)*(.97+f2*.04);
  vec2 sp=(p-uSP)/1.6+.5;                                       // stamp space (1.6 units square)
  float sh=exp(-pow(length(p-uSP)/1.3,2.)*1.2)*uShadow;c*=1.-sh*.45; // seal's shadow as it hovers
  if(sp.x>-.05&&sp.x<1.05&&sp.y>-.05&&sp.y<1.05){
    float n=texture2D(uN,sp*2.3).r,n2=texture2D(uN,sp*9.).b;
    vec2 q=sp+(vec2(n,texture2D(uN,sp*2.3+.4).g)-.5)*.012*uBleed;
    float s=texture2D(uStamp,vec2(q.x,1.-q.y)).r;                              // 1 = red ink area
    float cover=uInk*smoothstep(.25,.75,n2*.6+n*.5+uInk*.5);     // uneven ink transfer
    vec3 red=vec3(.72,.12,.08)*(.85+n2*.25);
    float a=s*cover;float halo=smoothstep(.06,0.,abs(s-.5)-.45)*uBleed*.15;
    c=mix(c,red,clamp(a+halo,0.,1.));}
  gl_FragColor=vec4(c,1.);}`;
const STONE_V = /* glsl */`varying vec3 vN,vW,vP;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const STONE_F = NOISE + /* glsl */`varying vec3 vN,vW,vP;void main(){vec3 n=normalize(vN);vec3 V=normalize(cameraPosition-vW);vec3 L=normalize(vec3(-.5,1.,.6));
  float vein=snoise(vP*1.6+vec3(0.,vP.y*2.,0.));float v2=smoothstep(.02,0.,abs(snoise(vP*3.)))*.5;
  vec3 base=mix(vec3(.30,.40,.34),vec3(.52,.62,.52),vein*.5+.5);base=mix(base,vec3(.80,.78,.66),v2);  // 青田石 green-grey with pale veins
  float sss=pow(max(dot(-V,L),0.),2.)*.15+.12;
  float dif=max(dot(n,L),0.);float spec=pow(max(dot(reflect(-L,n),V),0.),60.)*.5;float rim=pow(1.-max(dot(n,V),0.),3.)*.35;
  vec3 c=base*(.35+.7*dif+sss)+spec+rim*vec3(1.,.85,.6);
  if(vP.y<-.98)c=vec3(.7,.12,.08)*(.6+.4*dif);                    // inked face
  gl_FragColor=vec4(c,1.);}`;
const FLECK_F = /* glsl */`uniform float uA;varying vec2 vUv;void main(){float d=length(vUv-.5);if(d>.5)discard;gl_FragColor=vec4(.72,.12,.08,smoothstep(.5,.3,d)*uA);}`;

function stampTexture() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff';
  // 阴文: red square with white characters carved out; rounded worn border
  g.beginPath(); g.roundRect ? g.roundRect(24, 24, S - 48, S - 48, 26) : g.rect(24, 24, S - 48, S - 48); g.fill();
  g.fillStyle = '#000'; g.font = '700 200px "Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC","Songti SC",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('墨', S * .5, S * .3); g.fillText('川', S * .5, S * .72);
  const r = mulberry(3); for (let i = 0; i < 400; i++) { g.fillStyle = r() < .5 ? '#000' : '#fff'; const x = r() * S, y = r() * S; if (x > 40 && x < S - 40 && y > 40 && y < S - 40 && r() < .7) continue; g.fillRect(x, y, 2 + r() * 5, 2 + r() * 5); }
  const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; t.flipY = true; return t;
}
export function createSeal(ctx) {
  const { TIER, noise } = ctx; const rnd = mulberry(9);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(36, 1, .1, 80);
  const SP = new THREE.Vector2(1.6, -.2);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.ShaderMaterial({ vertexShader: PAPER_V, fragmentShader: PAPER_F,
    uniforms: { uN: { value: noise }, uStamp: { value: null }, uInk: { value: 0 }, uBleed: { value: 0 }, uShadow: { value: 0 }, uSP: { value: SP } } }));
  paper.rotation.x = -Math.PI / 2; scene.add(paper);
  const seal = new THREE.Group(); scene.add(seal);
  const sh = new THREE.Shape(); const R = .1, h = .8; sh.moveTo(-h + R, -h); sh.lineTo(h - R, -h); sh.quadraticCurveTo(h, -h, h, -h + R); sh.lineTo(h, h - R); sh.quadraticCurveTo(h, h, h - R, h); sh.lineTo(-h + R, h); sh.quadraticCurveTo(-h, h, -h, h - R); sh.lineTo(-h, -h + R); sh.quadraticCurveTo(-h, -h, -h + R, -h);
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 4, curveSegments: 8 }); bg.rotateX(-Math.PI / 2); bg.translate(0, -1, 0);
  const mat = new THREE.ShaderMaterial({ vertexShader: STONE_V, fragmentShader: STONE_F });
  seal.add(new THREE.Mesh(bg, mat));
  const knob = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.1, 0], [1.1, .06], [.98, .2], [.7, .34], [.34, .42], [0, .44]].map(([x, y]) => new THREE.Vector2(x, y)), 4, Math.PI / 4), mat); knob.position.y = 1.45; seal.add(knob); // pyramidal domed top, square in plan
  const flecks = new THREE.Group(); scene.add(flecks);
  for (let i = 0; i < 14; i++) { const s = .025 + rnd() * .07; const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.ShaderMaterial({ vertexShader: /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: FLECK_F, transparent: true, depthWrite: false, uniforms: { uA: { value: 0 } } }));
    m.rotation.x = -Math.PI / 2; const a = rnd() * 6.28, r = 1.05 + rnd() * rnd() * .9; m.position.set(SP.x + Math.cos(a) * r, .002, SP.y + Math.sin(a) * r); flecks.add(m); }
  const cam = { y: 7, z: 5.5 }; let init = false; const _v = new THREE.Vector3(); let VW = 1, VH = 1, oy = -1;
  return {
    id: 'seal', scene, camera, dark: 0, jobs: [() => { paper.material.uniforms.uStamp.value = stampTexture(); }], finish() {},
    resize(w, h) { camera.aspect = w / h; camera.fov = w / h < .8 ? 52 : 36;
      // frame the stamp right of the (left-aligned) pricing headline without changing perspective
      if (w / h > 1) camera.setViewOffset(w, h, -w * .25, h * .16, w, h); else camera.setViewOffset(w, h, -w * .12, h * .24, w, h); camera.updateProjectionMatrix(); VW = w; VH = h; oy = -1; }, // portrait: impression sits high, clear of the stacked plan cards
    anchor(asp) { // impression centre + half size on screen (uv, height units) for the stamp transition
      const c = _v.set(SP.x, 0, SP.y).project(camera), cx = c.x, cy = c.y;
      const ex = _v.set(SP.x + .73, 0, SP.y).project(camera).x, ey = _v.set(SP.x, 0, SP.y - .73).project(camera).y;
      return [cx * .5 + .5, cy * .5 + .5, Math.abs(ex - cx) * .5 * asp, Math.abs(ey - cy) * .5]; },
    update(st) {
      const { dt, p, ptr, t } = st;
      // the chapter transition IS the press: at p=0 the impression is already inked and the stone has just lifted;
      // it rises away up-right and leaves the frame early so it never crowds the plans
      const k = clamp((p - .2) / .3); const lift = easeInOut(k); // scene p≈.2 when the stamp transition completes
      const y = lerp(2.2, 7, lift);
      seal.position.set(SP.x + .75 + lift * 2.4, y, SP.y - .9 - lift * 1.8); seal.rotation.set(-.12 - lift * .4, .25 + Math.sin(t * .4) * .02, .08 + lift * .25);
      seal.scale.set(1, 1, 1); seal.visible = lift < .999;
      const u = paper.material.uniforms; u.uInk.value = 1; u.uBleed.value = sstep(0, .6, p); u.uShadow.value = (1 - lift) * .55;
      flecks.children.forEach((m, i) => m.material.uniforms.uA.value = .8);
      const ty = lerp(7.5, 9.5, sstep(.5, 1, p)), tz = lerp(4.5, 5.5, p);
      if (!init || st.snap) { cam.y = ty; cam.z = tz; init = true; } cam.y = damp(cam.y, ty, st.k, dt); cam.z = damp(cam.z, tz, st.k, dt);
      const off = 0;
      camera.position.set(SP.x + off + ptr.x * .2, cam.y, SP.y + cam.z + ptr.y * .1); camera.lookAt(SP.x + off, 0, SP.y);
      if (VW / VH <= 1) { // portrait: the impression scrolls up and out with the page before the stacked plan cards reach it, like ink printed on the page
        const y = VH * .24 + Math.min(VH * 1.4, Math.max(0, p * (st.span || 1) - VH * .7)); if (Math.abs(y - oy) > .5) { oy = y; camera.setViewOffset(VW, VH, -VW * .12, y, VW, VH); camera.updateProjectionMatrix(); } }
    },
  };
}
