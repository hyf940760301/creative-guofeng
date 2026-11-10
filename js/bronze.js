// 三足圆鼎 — procedural bronze ding. Lathe body (arc-length resampled profile), baked height map with
// taotie (饕餮) masks over a cloud-thunder (云雷纹) ground, flanges (扉棱), bowstring ribs and hanging blades,
// derived normal map, PBR albedo/roughness/metalness with verdigris + cuprite patina and cavity AO.
import * as THREE from 'three';
import { bake } from './util.js';
import { FS_VERT } from './shaders.js';

const HEIGHT_F = /* glsl */`uniform float uB0,uB1,uL0,uRim,uMode,uLegA,uLegB,uLegF;varying vec2 vUv;
float box(vec2 p,vec2 b){vec2 d=abs(p)-b;return length(max(d,0.))+min(max(d.x,d.y),0.);}
float ell(vec2 p,vec2 r){return (length(p/r)-1.)*min(r.x,r.y);}
float raise(float sd,float w){return smoothstep(w,-w,sd);}
// 云雷纹: square spiral ground pattern
float leiwen(vec2 p){vec2 c=fract(p)-.5;float m=max(abs(c.x),abs(c.y));float a=atan(c.y,c.x)/6.2831853+.5;float s=fract(m*7.-a*1.);return smoothstep(.42,.5,s)*smoothstep(.98,.9,s)*smoothstep(.49,.44,m);}
float hash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5);}
void main(){float u=vUv.x,v=vUv.y;float h=0.;
  if(uMode<.5){
    // bowstring ribs framing the band, rim lip
    h+=raise(abs(v-(uB0-.012))-.004,.002)*.55+raise(abs(v-(uB1+.012))-.004,.002)*.55;
    if(v>uB0&&v<uB1){
      float py=(v-uB0)/(uB1-uB0)*2.-1.;float px=fract(u*3.)*2.-1.;vec2 q=vec2(abs(px),py);
      float g=leiwen(vec2(u*3.*14.,py*3.6))*.22;                         // low relief ground
      float face=0.;
      face=max(face,raise(ell(q-vec2(.3,.12),vec2(.13,.09)),.012));       // eyes
      float pupil=raise(abs(q.x-.3)-.02,.004)*raise(abs(q.y-.12)-.075,.004);
      face=max(face,raise(abs(ell(q-vec2(.33,.34),vec2(.26,.13)))-.03,.01)*step(.3,q.y)); // brows
      face=max(face,raise(abs(ell(q-vec2(.66,.36),vec2(.17,.24)))-.035,.01)*step(.5,q.x));// horns (C curls)
      face=max(face,raise(abs(ell(q-vec2(.24,-.45),vec2(.22,.18)))-.035,.01)*step(q.y,-.38)); // jaws
      face=max(face,raise(box(q-vec2(.12,-.1),vec2(.06,.22)),.01));        // nose bridge
      face=max(face,raise(abs(ell(q-vec2(.82,-.25),vec2(.12,.2)))-.03,.01)*step(.68,q.x)); // body curls
      face=max(face-pupil*.9,0.);
      // flanges: notched vertical ridges at panel centre & panel edges
      float fl=raise(abs(px)-.035,.008)+raise(1.-abs(px)-.02,.008);
      fl*=.75+.25*step(.5,fract(py*4.));
      h+=max(max(g,face*.85),fl*1.0);
    }
    // hanging blades (蕉叶/蝉纹) below the band
    if(v>uL0&&v<uB0-.03){float py=(v-uL0)/(uB0-.03-uL0);float px=fract(u*12.)*2.-1.;
      float tri=raise(abs(px)-py*.9,.03)*smoothstep(0.,.05,py);
      float inner=leiwen(vec2(u*12.*3.,py*4.))*.5;h+=tri*(.35+inner*.4);}
    h+=raise(abs(v-uRim)-.006,.003)*.6;
  } else if(uMode<1.5){
    // handles (立耳): a raised border bead following the loop, plain cast faces
    h+=leiwen(vec2(u*24.,v*6.))*.08;
  } else {
    // legs (柱足): bowstring ribs framing a taotie mask at the top of the outward face; plain shaft below
    float a0=uLegA,a1=uLegB;                                             // v range of the mask band
    h+=raise(abs(v-(a0-.012))-.0035,.0015)*.6+raise(abs(v-(a1+.01))-.0035,.0015)*.6;
    if(v>a0&&v<a1){
      float px=(u-.5)/.2,py=(v-a0)/(a1-a0)*2.-1.;vec2 q=vec2(abs(px),py);
      float inside=step(abs(px),1.);
      float g=leiwen(vec2(u*40.,py*2.4))*.18;
      float face=0.;
      face=max(face,raise(ell(q-vec2(.34,.18),vec2(.16,.12)),.02));                       // eyes
      float pupil=raise(abs(q.x-.34)-.03,.006)*raise(abs(q.y-.18)-.09,.006);
      face=max(face,raise(abs(ell(q-vec2(.38,.48),vec2(.3,.16)))-.045,.016)*step(.4,q.y)); // brows
      face=max(face,raise(abs(ell(q-vec2(.74,.42),vec2(.2,.3)))-.05,.016)*step(.56,q.x));  // horns
      face=max(face,raise(abs(ell(q-vec2(.28,-.55),vec2(.26,.22)))-.05,.016)*step(q.y,-.42)); // jaw
      face=max(face,raise(box(q-vec2(.0,-.08),vec2(.09,.32)),.012));                     // nose ridge / flange
      face=max(face-pupil*.9,0.);
      float fl=raise(abs(px)-.05,.01)*(.75+.25*step(.5,fract(py*3.)));                    // notched flange on the axis
      h+=max(max(g,face*.9),fl)*inside;
    }
    h+=raise(abs(v-uLegF)-.004,.0015)*.4;                                 // ring above the flat foot
  }
  h+=(hash(floor(vUv*512.))-.5)*.01;                                     // casting grain
  gl_FragColor=vec4(h,h,h,1.);}`;
const NORMAL_F = /* glsl */`uniform sampler2D uH;uniform vec2 uPx;uniform float uS;varying vec2 vUv;
void main(){float l=texture2D(uH,vUv-vec2(uPx.x,0.)).r,r=texture2D(uH,vUv+vec2(uPx.x,0.)).r,d=texture2D(uH,vUv-vec2(0.,uPx.y)).r,t=texture2D(uH,vUv+vec2(0.,uPx.y)).r;
  vec3 n=normalize(vec3((l-r)*uS,(d-t)*uS,1.));gl_FragColor=vec4(n*.5+.5,1.);}`;
const SURF_F = /* glsl */`uniform sampler2D uH,uN;uniform float uMode,uIn;uniform vec2 uPx;varying vec2 vUv;
void main(){float h=texture2D(uH,vUv).r;
  float blur=0.;for(int i=-2;i<=2;i++)for(int j=-2;j<=2;j++)blur+=texture2D(uH,vUv+vec2(float(i),float(j))*uPx*3.).r;blur/=25.;
  float cav=clamp((blur-h)*6.,0.,1.);                                     // recesses
  float wear=clamp((h-blur)*8.,0.,1.);                                    // raised edges get polished
  vec4 n=texture2D(uN,vUv*vec2(2.,1.)),n2=texture2D(uN,vUv*vec2(6.,3.)+.3);
  float pat=smoothstep(.42,.7,n.r*.7+n2.a*.3+cav*.35-wear*.5+(1.-vUv.y)*.08*(1.-min(uMode,1.)));
  float red=smoothstep(.62,.8,n.g*.8+n2.r*.25)*(1.-pat)*.8;
  vec3 bronze=vec3(.40,.25,.11),verd=vec3(.16,.36,.30),verd2=vec3(.36,.52,.42),cupr=vec3(.32,.09,.05),dirt=vec3(.035,.03,.025);
  vec3 alb=mix(bronze,mix(verd,verd2,n2.g),pat);alb=mix(alb,cupr,red);alb=mix(alb,dirt,cav*.75);alb=mix(alb,vec3(.62,.42,.2),wear*(1.-pat)*.6);
  float rough=mix(.32,.85,pat);rough=mix(rough,.95,cav*.6);rough=mix(rough,.22,wear*.7);
  float metal=mix(.95,.05,pat)*(1.-cav*.6);
  float ao=1.-cav*.75;
  if(uIn>0.){ // vessel interior: darker, crusted patina deepening toward the floor, a faint pale mineral line below the lip
    float ins=smoothstep(uIn,uIn+.025,vUv.y),dep=smoothstep(uIn,1.,vUv.y);
    float mot=n.b*.6+n2.r*.4;float crust=smoothstep(.45,.75,mot);
    vec3 ia=mix(mix(vec3(.13,.25,.21),vec3(.24,.36,.29),crust),vec3(.05,.045,.035),dep*.6);
    ia=mix(ia,vec3(.42,.5,.4),smoothstep(.012,0.,abs(vUv.y-uIn-.07-n.r*.012))*.45);
    alb=mix(alb,ia,ins*.85);rough=mix(rough,.9,ins);metal=mix(metal,.08,ins);ao=mix(ao,.55-.3*dep,ins);}
  gl_FragColor=vec4(alb,1.);
  #ifdef ORM
  gl_FragColor=vec4(ao,rough,metal,1.);
  #endif
}`;

function resample(pts, n) { // arc-length resample so lathe uv.y ≈ arc length
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const out = []; const tot = L[L.length - 1];
  for (let k = 0; k < n; k++) { const s = k / (n - 1) * tot; let i = 1; while (i < L.length - 1 && L[i] < s) i++; const f = (s - L[i - 1]) / (L[i] - L[i - 1] || 1); out.push(pts[i - 1].clone().lerp(pts[i], f)); }
  return { out, L, tot };
}
export function buildDing({ tier, noise }) {
  const S = tier === 2 ? 1 : tier === 1 ? .7 : .45;
  // outer profile (bottom centre → rim lip → inner wall → inner floor). Radius, height.
  const raw = [[0, -.36], [.3, -.38], [.55, -.31], [.72, -.18], [.8, -.02], [.82, .14], [.8, .27], [.79, .34], [.82, .38], [.86, .41], [.86, .445], [.82, .45], [.77, .43], [.75, .36], [.75, .2], [.71, -.05], [.58, -.22], [.32, -.29], [0, -.3]].map(([x, y]) => new THREE.Vector2(x, y));
  const smooth = new THREE.SplineCurve(raw).getPoints(220);
  const { out: prof, tot } = resample(smooth, Math.round(200 * S) + 40);
  // v of key features (arc length fractions) to place the band etc.
  const vAt = (y, outer = true) => { let s = 0; for (let i = 1; i < smooth.length; i++) { s += smooth[i].distanceTo(smooth[i - 1]); if (outer && smooth[i].y >= y && smooth[i].x > .5) return s / tot; } return .5; };
  const uIn = (() => { let acc = 0, top = false; for (let i = 1; i < smooth.length; i++) { acc += smooth[i].distanceTo(smooth[i - 1]); if (smooth[i].y > .445) top = true; if (top && smooth[i].x < .775) return acc / tot; } return -1; })(); // start of the inner wall
  const uB0 = vAt(.06), uB1 = vAt(.3), uL0 = vAt(-.24), uRim = vAt(.43);
  const W = Math.round(2048 * S), H = Math.round(1024 * S);
  const mats = {};
  for (const mode of [0, 1]) {
    const hTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: HEIGHT_F, uniforms: { uB0: { value: uB0 }, uB1: { value: uB1 }, uL0: { value: uL0 }, uRim: { value: uRim }, uMode: { value: mode } } }), W, H, { mip: false, wrap: true });
    const px = new THREE.Vector2(1 / W, 1 / H);
    const nTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: NORMAL_F, uniforms: { uH: { value: hTex }, uPx: { value: px }, uS: { value: 7 } } }), W, H, { wrap: true });
    const aTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: SURF_F, uniforms: { uH: { value: hTex }, uN: { value: noise }, uMode: { value: mode }, uPx: { value: px }, uIn: { value: mode === 0 ? uIn : -1 } } }), W, H, { wrap: true });
    const oTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: SURF_F, defines: { ORM: 1 }, uniforms: { uH: { value: hTex }, uN: { value: noise }, uMode: { value: mode }, uPx: { value: px }, uIn: { value: mode === 0 ? uIn : -1 } } }), W, H, { wrap: true });
    const m = new THREE.MeshStandardMaterial({ map: aTex, normalMap: nTex, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: oTex, metalnessMap: oTex, aoMap: oTex, aoMapIntensity: 1, roughness: 1, metalness: 1, envMapIntensity: 1.25 });
    if (mode === 0) { m.displacementMap = hTex; m.displacementScale = .018; m.displacementBias = 0; }
    m.userData.uExp = { value: 1.15 }; m.userData.uPatina = { value: 0 };
    m.onBeforeCompile = (sh) => { sh.uniforms.uExp = m.userData.uExp; sh.uniforms.uPatina = m.userData.uPatina;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uExp,uPatina;\nvec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}\nvoid main() {')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(.42,.27,.12), diffuseColor.rgb, .35), uPatina);')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n gl_FragColor.rgb = pow(aces(gl_FragColor.rgb*uExp), vec3(1./2.2));'); };
    mats[mode] = m;
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, Math.round(256 * S) + 32), mats[0]); g.add(body);
  // columnar legs (柱足): straight, slightly tapered, crisp chamfers, flat foot; own map with a taotie at the top
  const legP = [[0, -.74], [.112, -.74], [.121, -.735], [.124, -.727], [.124, -.71], [.117, -.704], [.111, -.698], [.115, -.45], [.121, -.2], [.124, -.1], [.124, -.04], [0, -.04]].map(([x, y]) => new THREE.Vector2(x, y));
  const legG = new THREE.LatheGeometry(legP, Math.round(64 * S) + 16);
  const legSegs = []; let legTot = 0; for (let i = 1; i < legP.length; i++) { const d = legP[i].distanceTo(legP[i - 1]); legSegs.push(d); legTot += d; }
  const legV = y => { let a = 0; for (let i = 1; i < legP.length; i++) { const p0 = legP[i - 1], p1 = legP[i]; if (p1.y >= y && p0.y <= y && p1.y !== p0.y) return (a + legSegs[i - 1] * (y - p0.y) / (p1.y - p0.y)) / legTot; a += legSegs[i - 1]; } return .5; };
  { const hTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: HEIGHT_F, uniforms: { uB0: { value: 0 }, uB1: { value: 0 }, uL0: { value: 0 }, uRim: { value: -1 }, uMode: { value: 2 }, uLegA: { value: legV(-.36) }, uLegB: { value: legV(-.15) }, uLegF: { value: legV(-.69) } } }), 1024, 1024, { mip: false, wrap: true });
    const px = new THREE.Vector2(1 / 1024, 1 / 1024);
    const nTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: NORMAL_F, uniforms: { uH: { value: hTex }, uPx: { value: px }, uS: { value: 9 } } }), 1024, 1024, { wrap: true });
    const aTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: SURF_F, uniforms: { uH: { value: hTex }, uN: { value: noise }, uMode: { value: 1 }, uPx: { value: px }, uIn: { value: -1 } } }), 1024, 1024, { wrap: true });
    const oTex = bake(new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: SURF_F, defines: { ORM: 1 }, uniforms: { uH: { value: hTex }, uN: { value: noise }, uMode: { value: 1 }, uPx: { value: px }, uIn: { value: -1 } } }), 1024, 1024, { wrap: true });
    const m = mats[1].clone(); m.map = aTex; m.normalMap = nTex; m.roughnessMap = oTex; m.metalnessMap = oTex; m.aoMap = oTex; m.envMapIntensity = 1.05; m.userData = mats[1].userData; m.onBeforeCompile = mats[1].onBeforeCompile; mats[2] = m; }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + Math.PI / 6; const leg = new THREE.Mesh(legG, mats[2]); leg.position.set(Math.cos(a) * .5, -.18, Math.sin(a) * .5); leg.rotation.y = -Math.PI / 2 - a; g.add(leg); }  // u=.5 (the mask) faces outward
  // upright loop handles (立耳) on the rim, slightly flared
  const sh = new THREE.Shape(); const w = .2, hgt = .3, r = .07, tk = .055;
  sh.moveTo(-w, 0); sh.lineTo(-w, hgt - r); sh.quadraticCurveTo(-w, hgt, -w + r, hgt); sh.lineTo(w - r, hgt); sh.quadraticCurveTo(w, hgt, w, hgt - r); sh.lineTo(w, 0); sh.lineTo(w - tk, 0); sh.lineTo(w - tk, hgt - tk - .02); sh.quadraticCurveTo(w - tk, hgt - tk, w - tk - .03, hgt - tk); sh.lineTo(-w + tk + .03, hgt - tk); sh.quadraticCurveTo(-w + tk, hgt - tk, -w + tk, hgt - tk - .02); sh.lineTo(-w + tk, 0); sh.closePath();
  const hg = new THREE.ExtrudeGeometry(sh, { depth: .05, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 3, curveSegments: 10 }); hg.translate(0, 0, -.025);
  { const P = hg.attributes.position, N = hg.attributes.normal, U = hg.attributes.uv, col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      U.setXY(i, .13 + x * 1.6 + z * 2.2, .55 + y * 1.4);
      const inner = Math.abs(N.getZ(i)) < .6 && Math.abs(x) < w - tk + .02 && y < hgt - tk + .02;   // walls facing into the loop
      const k = inner ? .5 + .25 * (y / hgt) : 1; col.set([k, k * 1.02, k], i * 3); }
    hg.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  { const m = mats[1].clone(); m.vertexColors = true; m.userData = mats[1].userData; m.onBeforeCompile = mats[1].onBeforeCompile; mats[3] = m; }
  for (const s of [-1, 1]) { const hm = new THREE.Mesh(hg, mats[3]); hm.position.set(s * .8, .43, 0); hm.rotation.y = Math.PI / 2; hm.rotation.x = 0; hm.rotation.z = s * -.08; g.add(hm); }
  g.traverse(o => { if (o.isMesh) { o.geometry.computeBoundingSphere(); } });
  return { group: g, mats: [mats[0], mats[1], mats[2], mats[3]] };
}
