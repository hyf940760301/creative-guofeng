// 远山 3D ranges: Song-style massifs (main peak, secondary peaks, layered foothills) as eroded heightfields,
// inked from their own structure — ink pools in gullies/shadow, lit faces stay paper-white, 披麻皴 strokes follow the
// fall line, crest lines and silhouettes carry tapered, broken brush contours, 点苔 moss dots sit on ridge breaks,
// and pines with real branching silhouettes cling to the ledges. A night branch redraws the same structure in silver.
import * as THREE from 'three';
import { mulberry, clamp } from '../util.js';

// ---------------------------------------------------------------- CPU noise
function makeNoise(seed) { const r = mulberry(seed); const P = new Uint16Array(512); const b = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } for (let i = 0; i < 512; i++) P[i] = b[i & 255];
  const V = new Float32Array(256).map(() => r() * 2 - 1);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const h = (a, c) => V[P[(P[a & 255] + c) & 511]]; const a0 = h(xi, yi), a1 = h(xi + 1, yi), b0 = h(xi, yi + 1), b1 = h(xi + 1, yi + 1);
    const l0 = a0 + (a1 - a0) * u; return l0 + (b0 + (b1 - b0) * u - l0) * v; }; }
const NZ = makeNoise(4242);
const ridgedMF = (x, y, oct) => { let s = 0, a = .5, f = 1, w = 1; for (let i = 0; i < oct; i++) { let n = 1 - Math.abs(NZ(x * f + i * 17.3, y * f - i * 9.1)); n *= n; s += n * a * w; w = clamp(n * 1.8); f *= 2.07; a *= .5; } return s; };
const fbm = (x, y, oct) => { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += NZ(x * f + 51.7, y * f + 3.1) * a; f *= 2.03; a *= .5; } return s; };

// ---------------------------------------------------------------- hydraulic erosion (droplets) on a grid, heights in cell units
function erode(H, nx, nz, drops, rnd) {
  const inertia = .06, cap = 5, minCap = .01, dep = .25, ero = .35, evap = .02, grav = 6, steps = 34;
  const gh = (x, z) => { const ix = x | 0, iz = z | 0, fx = x - ix, fz = z - iz, i = iz * nx + ix;
    const a = H[i], b = H[i + 1], c = H[i + nx], d = H[i + nx + 1];
    return [a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz, (b - a) * (1 - fz) + (d - c) * fz, (c - a) * (1 - fx) + (d - b) * fx]; };
  for (let k = 0; k < drops; k++) {
    let x = 1 + rnd() * (nx - 3), z = 1 + rnd() * (nz - 3), dx = 0, dz = 0, sp = 1, w = 1, sed = 0;
    for (let s = 0; s < steps; s++) { const ix = x | 0, iz = z | 0, fx = x - ix, fz = z - iz, i = iz * nx + ix; const [h, gx, gz] = gh(x, z);
      dx = dx * inertia - gx * (1 - inertia); dz = dz * inertia - gz * (1 - inertia); const l = Math.hypot(dx, dz); if (l < 1e-6) break; dx /= l; dz /= l;
      const x2 = x + dx, z2 = z + dz; if (x2 < 1 || z2 < 1 || x2 >= nx - 2 || z2 >= nz - 2) break;
      const dh = gh(x2, z2)[0] - h; const c = Math.max(-dh * sp * w * cap, minCap);
      if (sed > c || dh > 0) { const amt = dh > 0 ? Math.min(dh, sed) : (sed - c) * dep; sed -= amt;
        H[i] += amt * (1 - fx) * (1 - fz); H[i + 1] += amt * fx * (1 - fz); H[i + nx] += amt * (1 - fx) * fz; H[i + nx + 1] += amt * fx * fz; }
      else { const amt = Math.min((c - sed) * ero, -dh); // erode from a small 3×3 brush so gullies read as carved, not pitted
        for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) { const j = i + oz * nx + ox; const wgt = (ox === 0 && oz === 0) ? .36 : (ox && oz ? .06 : .1); H[j] -= amt * wgt; }
        sed += amt; }
      sp = Math.sqrt(Math.max(0, sp * sp + dh * grav)); w *= 1 - evap; x = x2; z = z2; } }
}

// ---------------------------------------------------------------- one massif: heightfield + structure attributes
export function buildMassif({ w, d, h, peaks, cell, seed, base, erodeK = 1 }) {
  const nx = Math.max(24, Math.round(w / cell)) + 1, nz = Math.max(12, Math.round(d / cell)) + 1; const cx = w / (nx - 1), cz = d / (nz - 1);
  const r = mulberry(seed); const H = new Float32Array(nx * nz); const so = r() * 100;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const u = i / (nx - 1) * 2 - 1, v = j / (nz - 1); const X = u * w * .5, Z = (v - .5) * d;
    let m = 0;
    for (const p of peaks) { const wx = X + fbm(X * .12 + so, Z * .12, 3) * p.rx * .7; const ax = (wx - p.x) / (wx < p.x ? p.rx * (p.skew || 1) : p.rx / (p.skew || 1)), az = (Z - p.z) / p.rz; const dd = Math.sqrt(ax * ax + az * az) + fbm(X * .35 + so, Z * .35, 3) * .35;
      const prof = Math.pow(clamp(1 - dd), p.sharp) * p.h; m = Math.max(m, prof) + Math.min(m, prof) * .12; }        // soft union of peaks
    const env = clamp(1 - Math.pow(Math.abs(u), 6)) * clamp((1 - Math.abs(v - .5) * 2) * 3.5);
    const rg = ridgedMF(X / h * .9 + so, Z / h * .9, 6);
    let y = m * (.58 + .75 * rg) + rg * h * .08;
    const st = h * .055; y += (Math.round(y / st) * st - y) * .28 * clamp(m / h * 2);                                      // faint rock strata
    H[j * nx + i] = Math.max(0, y) * env; }
  // erosion in cell units
  if (erodeK > 0) { const s = 1 / cx; for (let k = 0; k < H.length; k++) H[k] *= s; erode(H, nx, nz, Math.round(nx * nz * .9 * erodeK), r); for (let k = 0; k < H.length; k++) H[k] = Math.max(0, H[k] / s); }
  // relax erosion pits (deposition speckle) without losing the carved gullies
  const blur = (A, pass, k) => { const T = new Float32Array(A.length); for (let p = 0; p < pass; p++) { for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let sum = 0, c = 0;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) { const ii = i + ox, jj = j + oz; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; sum += A[jj * nx + ii]; c++; }
      T[j * nx + i] = A[j * nx + i] * (1 - k) + sum / c * k; } A.set(T); } };
  blur(H, 2, .55);
  // geometry
  const g = new THREE.PlaneGeometry(w, d, nx - 1, nz - 1); g.rotateX(-Math.PI / 2); const pos = g.attributes.position; const n = pos.count;
  // after rotateX(-90°) PlaneGeometry row 0 sits at z=-d/2, which is grid row 0 (Z=(v-.5)d)
  for (let k = 0; k < n; k++) pos.setY(k, base + H[k]);
  g.computeVertexNormals();
  const K = new Float32Array(n), AO = new Float32Array(n), RG = new Float32Array(n);
  const at = (i, j) => H[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
  for (let k = 0; k < n; k++) { const i = k % nx, j = (k / nx) | 0; const y = at(i, j);
    const lap = (at(i + 1, j) + at(i - 1, j) + at(i, j + 1) + at(i, j - 1) - 4 * y) / (cx * cx);
    const lap2 = (at(i + 3, j) + at(i - 3, j) + at(i, j + 3) + at(i, j - 3) - 4 * y) / (9 * cx * cx);
    K[k] = clamp((lap * .4 + lap2 * .6) * cx * 3.2 / Math.max(.3, h * .1), -1, 1);
    let occ = 0; for (const [ddx, ddz] of dirs) { let mx = 0; for (let s = 1, t = 2; s <= 5; s++, t *= 1.8) { const e = (at(Math.round(i + ddx * t), Math.round(j + ddz * t)) - y) / (t * cx); if (e > mx) mx = e; } occ += Math.atan(mx) / 1.5708; }
    AO[k] = 1 - occ / dirs.length;
    // crest mask: convex across the slope and above its neighbours on at least one axis pair
    // crest flag: a local maximum across at least one direction (≈1 cell wide, so it interpolates to a thin line)
    let cr = 0; for (const [a1, b1] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const A = at(i + a1, j + b1), B = at(i - a1, j - b1); if (y > A && y > B) cr = Math.max(cr, clamp((y - (A + B) * .5) / (cx * .35))); }
    RG[k] = cr * clamp(y / (h * .12)); }
  blur(K, 4, .8); blur(AO, 3, .8);
  g.setAttribute('aK', new THREE.BufferAttribute(K, 1)); g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1)); g.setAttribute('aRG', new THREE.BufferAttribute(RG, 1));
  g.computeBoundingSphere();
  // trace crest polylines through the crest flags (for the night silver brush lines), then smooth them
  const seen = new Uint8Array(n); const lines = []; const ord = [];
  for (let k = 0; k < n; k++) if (RG[k] > .5 && H[k] > h * .12) ord.push(k);
  ord.sort((a, b) => H[b] - H[a]);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const k0 of ord) { if (seen[k0]) continue; const walk = (k, dir) => { const out = []; let px = dir[0], pz = dir[1];
      for (let s = 0; s < 400; s++) { const i = k % nx, j = (k / nx) | 0; let best = -1, bs = -1e9, bd = null;
        for (const [ox, oz] of NB) { const ii = i + ox, jj = j + oz; if (ii < 1 || jj < 1 || ii >= nx - 1 || jj >= nz - 1) continue; const q = jj * nx + ii; if (seen[q] || RG[q] < .3) continue;
          const dl = Math.hypot(ox, oz); const sc = RG[q] + (px * ox + pz * oz) / dl * .6 + (H[q] - H[k]) / (cx * 6); if (sc > bs) { bs = sc; best = q; bd = [ox / dl, oz / dl]; } }
        if (best < 0) break; seen[best] = 1; out.push(best); px = bd[0]; pz = bd[1]; k = best; } return out; };
    seen[k0] = 1; const a = walk(k0, [1, 0]), b = walk(k0, [-1, 0]); const chain = [...b.reverse(), k0, ...a];
    if (chain.length < 7) continue;
    let pts = chain.map(k => [-w / 2 + (k % nx) * cx, base + H[k], -d / 2 + ((k / nx) | 0) * cz]);
    for (let it = 0; it < 3; it++) { const q = [pts[0]]; for (let m = 0; m < pts.length - 1; m++) { const A = pts[m], B = pts[m + 1]; q.push([A[0] * .75 + B[0] * .25, A[1] * .75 + B[1] * .25, A[2] * .75 + B[2] * .25], [A[0] * .25 + B[0] * .75, A[1] * .25 + B[1] * .75, A[2] * .25 + B[2] * .75]); } q.push(pts[pts.length - 1]); pts = q; }   // Chaikin
    for (const p of pts) { const i = clamp(Math.round((p[0] + w / 2) / cx), 0, nx - 1), j = clamp(Math.round((p[2] + d / 2) / cz), 0, nz - 1); p[1] = Math.max(p[1], base + H[j * nx + i]) + cx * .15; }  // ride on the crest
    lines.push(pts); }
  return { g, H, nx, nz, cx, cz, K, RG, AO, lines };
}

// ---------------------------------------------------------------- ink shader (day + night), shared by massifs and their reflections
export const MV = /* glsl */`attribute float aK,aAO,aRG,aM;uniform float uRefl,uWL,uLoc,uLS;varying vec3 vW,vN,vNv,vVv;varying float vK,vAO,vRG,vD,vM;
void main(){vec4 w=modelMatrix*vec4(position,1.);vW=uLoc>.5?position*uLS:w.xyz;vN=uLoc>.5?normalize(normal):normalize(mat3(modelMatrix)*normal);if(uRefl>.5)vN.y=-vN.y;vK=aK;vAO=aAO;vRG=aRG;vM=aM;
  vec4 mv=viewMatrix*w;vD=-mv.z;vNv=normalize(normalMatrix*normal);vVv=-mv.xyz;gl_Position=projectionMatrix*mv;}`;
export const MF = /* glsl */`uniform sampler2D uN;uniform vec3 uPaper,uInk,uFog;uniform float uNight,uRefl,uWL,uBase,uH,uFar,uT,uFoot,uF1,uLoc,uCK,uFade,uLS,uDbg;uniform vec3 uL;
varying vec3 vW,vN,vNv,vVv;varying float vK,vAO,vRG,vD,vM;
float nz(vec2 p){return texture2D(uN,p).r;}
float amp(float x,float k){return clamp((x-.5)*k+.5,0.,1.);}
void main(){
  if(uRefl<.5){if(vW.y<uWL-.01)discard;}else if(vW.y>uWL+.01)discard;
  vec3 n=normalize(vN);vec3 V=normalize(cameraPosition-vW);if(uRefl>.5)V.y=-V.y;
  float hN=clamp((vW.y-uBase)/uH,0.,1.);float far=smoothstep(8.,uFar,vD);
  vec3 L=uLoc>.5?normalize(uL):normalize(vec3(-.85,.5,-.15));float lam=dot(n,L);
  float slope=1.-clamp(n.y,0.,1.);
  // fall-line frame for 披麻皴: strokes run down the slope, spaced across it
  vec2 g=n.xz;float gl=length(g);g=gl>1e-3?g/gl:vec2(0.,1.);vec2 pp=vec2(-g.y,g.x);
  float across=dot(vW.xz,pp),down=vW.y;vec2 P2=vW.xz;
  if(uLoc>.5){across=vW.x+vW.y*((texture2D(uN,vW.xy*vec2(.02,.012)).g-.5)*.9+.12);P2=vW.xy;slope=.6+.4*slope;}   // cliff face: strokes hang down the face, slanting with each facet
  // hemp-fibre strokes: thin wavering lines along the fall line, broken into dabs, at two scales
  float wk=uLoc>.5?.2:1.;float wp=(texture2D(uN,vec2(across*.12,down*.05)*wk).r-.5)*28.+(texture2D(uN,vec2(across*.5,down*.3)*wk).g-.5)*6.;
  float q1=(across*uF1+wp)/6.2831853,q2=(across*uF1*1.9+wp*1.4+.3)/6.2831853;
  float w1=fwidth(q1),w2=fwidth(q2);
  float d1=.5-abs(fract(q1)-.5),d2=.5-abs(fract(q2)-.5);
  float id1=floor(q1),id2=floor(q2);
  float t1=fract(sin(id1*12.9898)*43758.5),t2=fract(sin(id2*78.233)*43758.5);              // each stroke its own tone / pressure
  float dk=uLoc>.5?.09:1.;float brk=smoothstep(.3,.6,amp(texture2D(uN,vec2(id1*.071,down*dk*(.12+t1*.15))).a,5.)+.12);float brk2=smoothstep(.35,.65,amp(texture2D(uN,vec2(id2*.053+.5,down*dk*(.25+t2*.25))).b,5.)+.1);
  float s1=smoothstep(w1*(1.3+t1*1.4),w1*.35,d1)*brk*(.55+.45*t1)*smoothstep(.4,.12,w1);
  float s2=smoothstep(w2*1.2,w2*.3,d2)*brk2*(.4+.6*t2)*smoothstep(.35,.1,w2);
  float shade=smoothstep(.75,-.35,lam);if(uDbg==3.)shade=0.;shade*=shade*(3.-2.*shade);
  float conc=smoothstep(.02,-.5,vK);float cvx=smoothstep(.05,.6,vK*-1.)*0.;
  float occ=1.-smoothstep(.45,1.,vAO);
  float ink=.04+shade*.72+conc*.35+occ*.6;ink=ink/(1.+ink*.3);
  float cun=(1.-uCK)*max(s1,s2*.7*(1.-uLoc))*mix(1.,smoothstep(.15,.6,max(shade,max(conc,occ))),uLoc)*smoothstep(.08,.35,slope)*(.55+.45*max(shade,max(conc,occ)))*(1.-smoothstep(.6,1.,far)*.5);
  if(uLoc>.5){   // 斧劈皴: broad tonal wedges dragged on the diagonal with ragged dry edges; ink pools only in the deep recesses
    float st=amp(texture2D(uN,vec2(dot(vW.xy,vec2(.9,.45))*.4,dot(vW.xy,vec2(-.45,.9))*.03)).r,7.);float rag=(st-.5)*.9+(amp(texture2D(uN,vW.xy*.03+.3).a,4.)-.5)*.5;
    float wedge=smoothstep(.34,.4,shade*.9+conc*.25+rag*.16);float dryE=smoothstep(.2,.8,st)*wedge*(1.-smoothstep(.55,.75,shade));
    float deep=smoothstep(.45,.95,occ+conc*.45);
    ink=.3+wedge*(.36+.2*shade)-dryE*.1+deep*.45-.2*smoothstep(.7,.95,lam);cun=0.;}
  if(uDbg==2.)cun=0.;ink=ink+cun*(.95-ink*.35);
  float gr=texture2D(uN,uLoc>.5?vW.xy*vec2(.5,.7):vW.xy*vec2(1.7,2.3)+vW.z*.37).a;ink*=.82+.36*amp(gr,4.);                // pigment granulation in the wash
  ink*=mix(.55,1.05,smoothstep(.0,.55,hN));                                         // ink thickens toward the crests (远山 tops dark, feet in mist)
  // crest lines: tapered, broken strokes along ridges
  float press=amp(texture2D(uN,P2*vec2(.23,.19)+vec2(.1,.3)).b,6.);float fr=fwidth(vRG);float rt=max(.5,1.-fr*1.6);float rgW=smoothstep(rt-fr*.9-.01,rt,vRG)*smoothstep(.15,.45,press)*(.55+.45*press)*smoothstep(.06,.28,hN);
  // silhouette contour from the view-grazing normal, kept thin with derivatives, with dry-brush breaks
  float rim=1.-abs(dot(normalize(vNv),normalize(vVv)));float fw=fwidth(rim)*1.5+.02;float sil=smoothstep(1.-fw*4.2,1.-fw*.5,rim)*(1.-uLoc);
  float dry=amp(nz(P2*.6+vW.y*.2),5.)*.6+.4;
  if(uDbg==1.)rgW=0.;rgW*=mix(1.,smoothstep(.5,.72,press)*smoothstep(.1,.5,occ+shade),uLoc);ink=max(ink,rgW*.95);ink=max(ink,sil*dry*(1.-far*.35));
  ink=clamp(ink,0.,1.);
  float foot=smoothstep(.02,uFoot,hN+(nz(P2*.15+uT*.004)-.5)*.25);                 // feet dissolve into river mist
  float aer=mix(1.,.32,far);
  vec3 col=mix(uPaper,uInk,ink*aer);col=mix(col,uFog,far*.35);
  float a=foot;float cl=0.;
  if(uLoc>.5){float fm=fwidth(vM)+1e-4;float body=smoothstep(.4,.6,vM);                                        // 门崖: mask edge = silhouette
    cl=(1.-smoothstep(fm*.4,fm*(.8+2.6*press),abs(vM-.53)))*smoothstep(.3,.62,press)*(.4+.6*press)*smoothstep(.1,.42,hN)*(.6+.4*dry);   // broken, tapered contour, gone in the mist
    float lay=mix(.42,1.,smoothstep(.02*uLS,.2*uLS,vW.z));                                                // low relief (spur, receding rock) reads paler
    float inner=mix(.55,1.,smoothstep(.52,.95,vM));                                                       // value eases off toward the inner edge
    ink=clamp(ink*lay*inner,0.,1.);ink=max(ink,cl*.9*lay);col=mix(uPaper,uInk,ink);a*=max(body*(.85+.15*inner),cl);}
  if(uNight>0.){
    float hair=0.; /* no hairline cun at night: it read as speckle */float line=max(max(sil*(.65+.35*dry)*.85,hair),cl*.9);line*=mix(1.,.5,far);
    vec3 Lm=normalize(vec3(.55,.45,-.35));float mo=smoothstep(-.25,.9,dot(n,Lm));
    vec3 fill=mix(vec3(.028,.028,.033),vec3(.1,.105,.12),far+(1.-foot)*.3)+vec3(.075,.077,.085)*mo*(.4+.6*hN)*(1.-far*.7)*(.6+.4*vAO);   // moonlit gradient wash so the forms read
    vec3 nc=mix(fill,vec3(.86,.85,.81)*mix(1.,.6,far),clamp(line,0.,1.));
    col=mix(col,nc,uNight);}
  if(uRefl>.5){float dep=uWL-vW.y;float sl=amp(nz(vec2(vW.x*.9,dep*.12+uT*.02)),3.);
    col=mix(col,mix(uPaper,vec3(.06,.06,.07),uNight),.42+.2*smoothstep(0.,uH,dep));a*=exp(-dep/uH*1.6)*(.7+.3*sl);}
  a*=1.-uFade;if(a<.01)discard;gl_FragColor=vec4(col,a);}`;

// ---------------------------------------------------------------- pines with real branching, drawn once on a 2D canvas atlas
export function pineAtlas(seed = 7) {
  const S = 256, N = 4, cv = document.createElement('canvas'); cv.width = S * N; cv.height = S; const c = cv.getContext('2d'); const r = mulberry(seed);
  c.lineCap = 'round'; c.lineJoin = 'round';
  const stroke = (pts, w0, w1, a) => { for (let i = 1; i < pts.length; i++) { const t = i / (pts.length - 1); c.strokeStyle = `rgba(16,14,12,${a})`; c.lineWidth = w0 + (w1 - w0) * t; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); } };
  const needles = (x, y, R, dir) => { // a 松针 cluster: radiating short strokes, densest on top, a wet core
    const n = 26 + (r() * 10 | 0); for (let k = 0; k < n; k++) { const a = -Math.PI * (.05 + .9 * r()) + dir * .15, L = R * (.55 + .5 * r());
      c.strokeStyle = `rgba(14,13,11,${.55 + r() * .4})`; c.lineWidth = .9 + r() * .9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * L * 1.25, y + Math.sin(a) * L * .55); c.stroke(); }
    c.fillStyle = 'rgba(14,13,11,.75)'; c.beginPath(); c.ellipse(x, y, R * .45, R * .16, 0, 0, Math.PI * 2); c.fill(); };
  for (let v = 0; v < N; v++) { const ox = v * S; c.save(); c.translate(ox, 0);
    const lean = (r() - .5) * .5 + (v === 3 ? .45 : 0), tall = v === 2 ? .92 : .78; const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([S * .5 + Math.sin(t * 2.6 + v) * S * .05 + lean * t * t * S * .3, S * (.98 - t * tall)]); }
    stroke(pts, 7, 2, .92);
    // bark ticks
    for (let i = 2; i < 10; i++) { const [x, y] = pts[i]; c.strokeStyle = 'rgba(14,13,11,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 2, y - 3); c.stroke(); }
    // branches: alternating, near-horizontal, slightly drooping then lifting at the tips (Song pine habit)
    const nb = 5 + (r() * 3 | 0);
    for (let b = 0; b < nb; b++) { const t = .35 + b / nb * .62, idx = Math.min(12, Math.round(t * 12)); const [bx, by] = pts[idx]; const side = (b % 2 ? 1 : -1) * (r() < .2 ? -1 : 1);
      const len = S * (.16 + .22 * (1 - t) + r() * .06); const bp = []; for (let i = 0; i <= 6; i++) { const s = i / 6; bp.push([bx + side * len * s, by + Math.sin(s * Math.PI) * len * .08 - s * s * len * .12]); }
      stroke(bp, 3.2 * (1 - t * .5), 1, .9);
      for (let k = 2; k <= 6; k += 2) { const [nx, ny] = bp[k]; needles(nx, ny - 2, S * (.05 + .05 * (1 - t)) * (k === 6 ? 1.1 : .85), side); } }
    needles(pts[12][0], pts[12][1] + 4, S * .07, 0);
    c.restore(); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4; tex.needsUpdate = true; return tex;
}
export const TREE_V = /* glsl */`attribute vec4 aP;attribute float aV;varying vec2 vUv;varying float vD;varying float vY;
void main(){vUv=vec2((uv.x+aV)/4.,uv.y);vec4 wp=modelMatrix*vec4(aP.xyz,1.);vY=wp.y;vec4 mv=viewMatrix*wp;mv.xy+=vec2(position.x,position.y+.5)*aP.w;vD=-mv.z;gl_Position=projectionMatrix*mv;}`;
export const TREE_F = /* glsl */`uniform sampler2D map;uniform vec3 uPaper,uInk;uniform float uNight,uFar,uWL;varying vec2 vUv;varying float vD;varying float vY;
void main(){if(vY<uWL)discard;vec4 t=texture2D(map,vUv);float a=t.a;if(a<.25)discard;float far=smoothstep(8.,uFar,vD);
  vec3 col=mix(uPaper,uInk,mix(1.,.35,far));col=mix(col,vec3(.035,.035,.04),uNight);gl_FragColor=vec4(col,min(1.,a*1.3)*mix(1.,.6,uNight));}`;
// 点苔 moss dots: short horizontal dabs on ridge breaks
export const MOSS_V = /* glsl */`attribute vec3 aS;uniform float uPR;varying float vD;varying float vS;void main(){vec4 mv=viewMatrix*modelMatrix*vec4(position,1.);vD=-mv.z;vS=aS.y;
  gl_Position=projectionMatrix*mv;gl_PointSize=uPR*aS.x*clamp(14./vD,.5,3.);}`;
export const MOSS_F = /* glsl */`uniform vec3 uInk,uPaper;uniform float uNight,uFar;varying float vD;varying float vS;
void main(){vec2 q=gl_PointCoord-.5;float c=cos(vS),s=sin(vS);q=mat2(c,-s,s,c)*q;q.y*=2.4;float d=length(q)+sin(atan(q.y,q.x)*5.+vS*9.)*.04;
  float a=smoothstep(.42,.34,d);if(a<.05)discard;float far=smoothstep(8.,uFar,vD);gl_FragColor=vec4(mix(mix(uPaper,uInk,mix(.95,.4,far)),vec3(.07,.07,.075),uNight),a*mix(1.,.85,uNight));}`;   // at night the dots sink into the ink instead of beading the silver lines

// ---------------------------------------------------------------- brush ribbons: screen-space width, pressure taper, breaks, soft glow
export function ribbonGeometry(lines, seed) { const r = mulberry(seed); const P = [], NX = [], SD = [], T = [], SE = [], idx = []; let v = 0;
  for (const L of lines) { const n = L.length; const sd = r() * 100, len = n;
    for (let m = 0; m < n; m++) { const a = L[m], b = L[Math.min(n - 1, m + 1)], c = L[Math.max(0, m - 1)]; const nx_ = m < n - 1 ? b : [2 * a[0] - c[0], 2 * a[1] - c[1], 2 * a[2] - c[2]];
      for (const s of [-1, 1]) { P.push(a[0], a[1], a[2]); NX.push(nx_[0], nx_[1], nx_[2]); SD.push(s); T.push(m / (n - 1)); SE.push(sd); }
      if (m < n - 1) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); v += 2; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aNext', new THREE.Float32BufferAttribute(NX, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(SD, 1)); g.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(SE, 1)); g.setIndex(idx); return g; }
export const RIB_V = /* glsl */`attribute vec3 aNext;attribute float aSide,aT,aSeed;uniform vec2 uRes;uniform float uW;varying float vS,vT,vSeed,vD,vWpx;
void main(){vec4 a=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.),b=projectionMatrix*viewMatrix*modelMatrix*vec4(aNext,1.);
  vec2 sa=a.xy/a.w*uRes*.5,sb=b.xy/b.w*uRes*.5;vec2 dir=sb-sa;float l=length(dir);dir=l>1e-4?dir/l:vec2(1.,0.);vec2 nrm=vec2(-dir.y,dir.x);
  vec4 mv=viewMatrix*modelMatrix*vec4(position,1.);vD=-mv.z;
  float press=pow(sin(3.14159*clamp(aT,0.,1.)),.55);                                  // pressure: enter thin, swell, lift off
  float wv=.65+.35*sin(aT*23.+aSeed)*sin(aT*7.3+aSeed*1.7);
  vWpx=uW*press*wv*clamp(18./vD,.45,1.6)+.6;
  vec2 off=nrm*aSide*(vWpx+2.);                                                          // +2px of feather for the soft glow
  a.xy+=off/(uRes*.5)*a.w;a.z-=.0015*a.w;gl_Position=a;vS=aSide*(vWpx+2.);vT=aT;vSeed=aSeed;}`;
export const RIB_F = /* glsl */`uniform float uNight,uFar;uniform sampler2D uN;varying float vS,vT,vSeed,vD,vWpx;
void main(){float d=abs(vS);float core=1.-smoothstep(vWpx*.5-.5,vWpx*.5+.7,d);float glow=exp(-d*d/(vWpx*vWpx*1.6+4.))*.28;
  float br=smoothstep(.22,.42,texture2D(uN,vec2(vT*(1.2+fract(vSeed)*1.5)+vSeed*.13,vSeed*.071)).r*1.9-.45);   // occasional elegant breaks
  float far=smoothstep(8.,uFar,vD);float a=(core*.92+glow)*br*uNight*mix(1.,.5,far);if(a<.004)discard;
  gl_FragColor=vec4(vec3(.9,.89,.85)*mix(1.,.8,far),a);}`;

// ---------------------------------------------------------------- 门崖: near-ground cliff relief for the opening (local frame: x 0 = outer screen edge → r = inner extent,
// y 0..2.6 bottom→top, z = relief toward the lens). Same attributes as the massifs so the shared ink shader reads it the same way.
export function buildCliff({ r = 1.15, seed = 3, ny = 420, Hh = 2.6 }) {
  const nx = Math.max(40, Math.round(ny * r / Hh)) + 1; ny += 1; const cx = r / (nx - 1), cy = Hh / (ny - 1); const rd = mulberry(seed); const so = rd() * 50;
  const N = nx * ny, H = new Float32Array(N), M = new Float32Array(N);
  // inner edge profile: a crown that leans out over the valley, two ledges, a waist, and a foot that recedes into the mist
  const L1 = .95 + rd() * .25, L2 = 1.55 + rd() * .2;
  const edge = (y, fine = true) => { const t = y / Hh;
    let e = .42 + .3 * Math.pow(Math.max(0, t - .6) / .4, 1.3) - .15 * Math.pow(Math.max(0, .42 - t) / .42, 1.2);
    e += .07 * Math.exp(-Math.pow((y - L1) / (y < L1 ? .1 : .05), 2)) + .05 * Math.exp(-Math.pow((y - L2) / (y < L2 ? .08 : .04), 2));   // ledges: sharp top, softer underside
    e += fbm(y * 2.2 + so, so, 3) * .11;
    return (fine ? e + fbm(y * 9 + so, 3.3, 3) * .035 + fbm(y * 30, so, 2) * .01 : e) * r; };
  const rocks = [[-.03, .86 + rd() * .1, .17, .17], [-.02, .5 + rd() * .08, .13, .11], [-.02, 1.36 + rd() * .1, .08, .06]];   // boulders at the foot / a ledge: [offset past the edge (×r), y, half-width (×r), height]
  const spur = { y0: .5 + rd() * .2, y1: 1.35 + rd() * .15, out: .22 };                                    // a paler receding spur behind the face
  // jittered Voronoi facets: every cell a tilted plane (lit or shaded as a whole), grooves along the seams
  const hsh = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
  const facets = (x, y, sz, amp) => { const wx = x + fbm(x * 3 + so, y * 3, 2) * sz * .5, wy = (y + fbm(x * 3, y * 3 + so, 2) * sz * .5) / 2.3; const u = wx / sz, v = wy / sz, iu = Math.floor(u), iv = Math.floor(v);
    let f1 = 9, f2 = 9, c1 = null; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const cu = iu + a, cv = iv + b; const px = cu + hsh(cu, cv, sz), py = cv + hsh(cv, cu, sz + 1); const dd = Math.hypot(u - px, v - py);
      if (dd < f1) { f2 = f1; f1 = dd; c1 = [cu, cv, px, py]; } else if (dd < f2) f2 = dd; }
    const [cu, cv, px, py] = c1; const tx = (hsh(cu, cv, 3) - .5) * 1.1, ty = (hsh(cu, cv, 5) - .6) * .4, hz = hsh(cu, cv, 7);
    const seam = Math.min(1, (f2 - f1) / .3), sm = seam * seam * (3 - 2 * seam); const pl = (hz * .35 + .25 + tx * (u - px) + ty * (v - py)) * sz;
    const gv = Math.min(1, (f2 - f1) / .09); return (pl * sm - (1 - gv * gv * (3 - 2 * gv)) * sz * .1) * amp; };   // planes meet in a groove, so the surface stays continuous
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, x = i * cx, y = j * cy;
    const e = edge(y), d = e - x;
    const ds = edge(y, false) - x; let z = Math.sqrt(clamp(ds / (.32 * r) + .08)) * .26 * r * (.7 + .3 * clamp(y / 1.4)) * clamp(d / (.03 * r) + .6);                          // the face bulges toward the lens; turns sideways at its edge
    let m = clamp(.5 + d / (.14 * r));
    // receding spur: low relief (reads paler), its own edge
    const ts = clamp((y - spur.y0) / (spur.y1 - spur.y0)); const se = e + spur.out * r * Math.sin(Math.PI * ts) * (1 + fbm(y * 4 + 7, so, 3) * .5) - .02 * r; const dsp = se - x;
    if (ts > 0 && ts < 1 && dsp > -.1 * r) { const ms = clamp(.5 + dsp / (.1 * r)); if (ms > m) m = ms; z = Math.max(z, Math.sqrt(clamp(dsp / (.15 * r))) * .07 * r); }
    for (const [ox, ry, rw, rh] of rocks) { const dx = (x - edge(ry) - ox * r) / (rw * r), dy = (y - ry) / rh;
      const dd = dy < 0 ? Math.hypot(dx, dy * 2.2) : Math.hypot(dx * (1 + dy * .25), dy * 1.05) + dx * dy * .25;   // flat-bedded base, a canted angular top
      const d2 = dd + fbm(x * 5 + so, y * 5, 3) * .22; const mr = clamp(.5 + (1 - d2) * 2.6); if (mr > m) m = mr; if (d2 < 1.1) z = Math.max(z, Math.sqrt(clamp(1 - d2)) * rw * r * .8 + .02 * r); }
    // rock structure: faceted blocks (ridged, slightly slanted), fissures, faint strata — no uniform vertical grain
    const in_ = clamp((m - .5) * 4);
    const det = facets(x, y, .3, 1) + fbm(x * 1.1 + so, y * .8, 3) * .05;   // axe-cut planes, cracked at their seams
    z += det * in_ * clamp(z / (.03 * r));
    H[k] = Math.max(0, z); M[k] = m; }
  const blur = (A, pass, kk) => { const T = new Float32Array(N); for (let p = 0; p < pass; p++) { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0, c = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const ii = i + ox, jj = j + oy; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; s += A[jj * nx + ii]; c++; }
      T[j * nx + i] = A[j * nx + i] * (1 - kk) + s / c * kk; } A.set(T); } };
  blur(H, 3, .7);
  const g = new THREE.PlaneGeometry(r, Hh, nx - 1, ny - 1); g.translate(r / 2, Hh / 2, 0); const pos = g.attributes.position; const n = pos.count;
  // PlaneGeometry row 0 is the top (y = Hh); map grid rows (j from the bottom) to vertex rows
  const vk = k => { const i = k % nx, row = (k / nx) | 0; return (ny - 1 - row) * nx + i; };
  const Hv = new Float32Array(n), Mv = new Float32Array(n); for (let k = 0; k < n; k++) { Hv[k] = H[vk(k)]; Mv[k] = M[vk(k)]; pos.setZ(k, Hv[k]); }
  g.computeVertexNormals();
  const K = new Float32Array(n), AO = new Float32Array(n), RG = new Float32Array(n);
  const at = (i, j) => H[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)]; const HS = H.slice(); { const T0 = H.slice(); blur(H, 4, .9); HS.set(H); H.set(T0); }
  const ats = (i, j) => HS[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
  for (let k = 0; k < n; k++) { const q = vk(k), i = q % nx, j = (q / nx) | 0; const y = at(i, j);
    const lap = (at(i + 2, j) + at(i - 2, j) + at(i, j + 2) + at(i, j - 2) - 4 * y) / (4 * cx * cx);
    const lap2 = (at(i + 5, j) + at(i - 5, j) + at(i, j + 5) + at(i, j - 5) - 4 * y) / (25 * cx * cx);
    K[k] = clamp((lap * .45 + lap2 * .55) * .007 / r, -1, 1);
    let occ = 0; for (const [a, b] of dirs) { let mx = 0; for (let s = 1, t = 2; s <= 5; s++, t *= 1.8) { const e = (at(Math.round(i + a * t), Math.round(j + b * t)) - y) / (t * cx); if (e > mx) mx = e; } occ += Math.atan(mx * .7) / 1.5708; }
    AO[k] = 1 - occ / dirs.length;
    let cr = 0; const ys = ats(i, j); for (const [a1, b1] of [[2, 0], [0, 2], [2, 2], [2, -2]]) { const A = ats(i + a1, j + b1), B = ats(i - a1, j - b1); if (ys > A && ys > B) cr = Math.max(cr, clamp((ys - (A + B) * .5) / (cx * .9))); }
    RG[k] = cr * .7 * clamp(Mv[k] * 2 - 1); }
  blur(K, 3, .8); blur(AO, 2, .8); blur(RG, 2, .7); for (let k = 0; k < n; k++) RG[k] = Math.min(1, RG[k] * 1.6);
  g.setAttribute('aK', new THREE.BufferAttribute(K, 1)); g.setAttribute('aAO', new THREE.BufferAttribute(AO, 1)); g.setAttribute('aRG', new THREE.BufferAttribute(RG, 1)); g.setAttribute('aM', new THREE.BufferAttribute(Mv, 1));
  g.computeBoundingSphere();
  return { g, edge, r, Hh };
}

// ---------------------------------------------------------------- a hanging pine (悬崖松) drawn as ink: tapered trunk with dry-brush bark, real branching,
// needle pads built from many dabs that vary in size, angle and density. Root sits at (0.03, 0.6) of the canvas, growing right.
export function hangingPine(seed = 5, S = 1024) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'); const r = mulberry(seed); c.lineCap = 'round'; c.lineJoin = 'round';
  const ink = a => `rgba(14,13,11,${a})`;
  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
  const limb = (pts, w0, w1, a, bark) => { // tapered limb as a filled outline + dry-brush bark strokes along it
    const L = [], R = []; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)]; let dx = q[0] - o[0], dy = q[1] - o[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = (w0 + (w1 - w0) * i / (pts.length - 1)) * (.85 + .3 * r()) * .5; L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]); }
    c.fillStyle = ink(a * (w0 > 20 ? .38 : .7)); c.beginPath(); c.moveTo(...L[0]); for (const p of L) c.lineTo(...p); for (const p of R.reverse()) c.lineTo(...p); c.closePath(); c.fill(); R.reverse();
    for (const [E, k0] of [[L, 1], [R, .7]]) { c.strokeStyle = ink(a * k0); c.lineWidth = Math.max(1.2, w0 * (k0 > .9 ? .16 : .1)); c.beginPath(); let on = false;      // broken contours, the shadow side heavier
      for (let i = 0; i < E.length; i++) { if (r() < .07) on = !on; if (!on) { c.moveTo(...E[i]); on = r() > .1; continue; } c.lineTo(...E[i]); } c.stroke(); }
    if (bark) for (let i = 1; i < pts.length - 1; i++) { const w = w0 + (w1 - w0) * i / (pts.length - 1); if (w < 5) continue; for (let k = 0; k < 2; k++) if (r() > .35) {  // 鳞皴 bark scales
      const [x, y] = pts[i]; const ox = (r() - .5) * w * .7, oy = (r() - .5) * w * .5; c.strokeStyle = 'rgba(245,240,228,' + (.25 + r() * .3) + ')'; c.lineWidth = 1 + r() * 1.5;
      c.beginPath(); c.ellipse(x + ox, y + oy, w * (.16 + r() * .14), w * (.08 + r() * .07), r() * 3, 0, Math.PI * (1 + r())); c.stroke(); } } };
  const dabs = (x, y, R, dens, tilt) => { // one 松针 cluster: dabs fanning upward/outward, wetter at the core
    const n = Math.round((14 + r() * 26) * dens);
    for (let k = 0; k < n; k++) { const a = tilt - Math.PI / 2 + (r() - .5) * 2.4, L = R * (.35 + .75 * Math.pow(r(), .7)); const ox = (r() - .5) * R * .35, oy = (r() - .2) * R * .18;
      const x0 = x + ox, y0 = y + oy, x1 = x0 + Math.cos(a) * L, y1 = y0 + Math.sin(a) * L * .62; c.strokeStyle = ink(.3 + r() * .55); c.lineWidth = .8 + r() * 1.8 * (R / 40);
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + (r() - .5) * 4, (y0 + y1) / 2 - 2, x1, y1); c.stroke(); }
    c.fillStyle = ink(.18 + r() * .2); c.beginPath(); c.ellipse(x, y + R * .05, R * (.5 + r() * .3), R * (.14 + r() * .08), (r() - .5) * .3, 0, Math.PI * 2); c.fill(); };
  const pad = (x, y, R, dir) => { // a flat needle pad: pale wash under, several clusters across it
    c.fillStyle = ink(.07); c.beginPath(); c.ellipse(x, y + R * .12, R * 1.25, R * .38, 0, 0, Math.PI * 2); c.fill();
    const m = 3 + (r() * 4 | 0); for (let k = 0; k < m; k++) { const t = (k / (m - 1 || 1) - .5) * 2; dabs(x + t * R * .95 + (r() - .5) * R * .2, y - (1 - t * t) * R * .22 + (r() - .5) * R * .15, R * (.42 + r() * .32), .7 + r() * .7, dir * .25 + t * .35); } };
  const P = (u, v) => [u * S, v * S];
  // trunk: out of the rock, a deep downward swoop, then rising (迎客 habit)
  let tr = [P(.03, .6)]; { let a = .55, x = .03 * S, y = .6 * S; const tg = [.75, .95, .35, -.15, -.55, -.25, -.75, -.45], seg = S * .085;
    for (const t of tg) { a = t + (r() - .5) * .3; x += Math.cos(a) * seg * (.8 + r() * .4); y += Math.sin(a) * seg * (.8 + r() * .4); tr.push([x, y]); } }
  for (let it = 0; it < 2; it++) { const q = [tr[0]]; for (let m = 0; m < tr.length - 1; m++) { const A = tr[m], B = tr[m + 1]; q.push([A[0] * .7 + B[0] * .3, A[1] * .7 + B[1] * .3], [A[0] * .3 + B[0] * .7, A[1] * .3 + B[1] * .7]); } q.push(tr[tr.length - 1]); tr = q; }
  { const q = []; for (let m = 0; m < tr.length - 1; m++) for (let k = 0; k < 3; k++) { const t = k / 3; q.push([tr[m][0] * (1 - t) + tr[m + 1][0] * t, tr[m][1] * (1 - t) + tr[m + 1][1] * t]); } q.push(tr[tr.length - 1]); tr = q; }
  const TN = tr.length - 1;
  // a root clutching the rock
  limb([P(.0, .52), P(.025, .57), P(.04, .6)], S * .03, S * .02, .9, false); limb([P(.01, .66), P(.03, .62)], S * .02, S * .012, .85, false);
  const pads = [];
  const branch = (x, y, ang, len, w, depth) => { const pts = []; let a = ang, px = x, py = y; const n = 8;
    for (let i = 0; i <= n; i++) { pts.push([px, py]); a += (r() - .5) * .25 - Math.sin(a) * .06; px += Math.cos(a) * len / n; py += Math.sin(a) * len / n * .8 - (i > n * .6 ? len * .012 : 0); }
    limb(pts, w, Math.max(1.4, w * .3), .9, w > 8);
    if (depth > 0) { const nb = 2 + (r() * 2 | 0); for (let b = 0; b < nb; b++) { const t = .35 + .55 * (b + r() * .5) / nb, idx = Math.round(t * n); const [bx, by] = pts[idx]; const side = r() < .5 ? -1 : 1;
      branch(bx, by, ang + side * (.35 + r() * .4) - .15, len * (.4 + r() * .25), w * .45, depth - 1); } }
    pads.push([px, py, S * (.055 + .03 * depth + r() * .025) * (len / (S * .25)) ** .3, Math.cos(a)]); };
  limb(tr, S * .052, S * .014, .92, true);
  // branches along the trunk, mostly level and reaching out over the valley, lifting at the tips
  const nb = 5; for (let b = 0; b < nb; b++) { const t = .32 + b * .15 + r() * .05, idx = Math.min(TN, Math.round(t * TN)); const [bx, by] = tr[idx]; const up = b % 2 === 0;
    branch(bx, by, (up ? -.35 : .12) + (r() - .5) * .3 - (b > 3 ? .4 : 0), S * (.16 + .1 * (1 - t) + r() * .06), S * .016 * (1.1 - t * .5), b < 3 ? 2 : 1); }
  pads.push([tr[TN][0], tr[TN][1] - S * .02, S * .085, 0]);
  pads.sort((a, b) => b[1] - a[1]); for (const [x, y, R, d] of pads) pad(x, y, Math.min(R, S * .12), d);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4; return tex;
}
export const PINE_V = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
export const PINE_F = /* glsl */`uniform sampler2D map;uniform vec3 uInk,uPaper;uniform float uNight,uA;varying vec2 vUv;
void main(){vec4 c=texture2D(map,vUv);float a=c.a*uA;if(a<.01)discard;float lum=dot(c.rgb,vec3(.33));vec3 day=mix(uInk,uPaper,smoothstep(.2,.95,lum)*.9);
  float e=clamp(fwidth(c.a)*3.,0.,1.);vec3 nc=mix(vec3(.05,.05,.055),vec3(.82,.81,.77),clamp(e*.8+smoothstep(.3,.9,lum)*.5,0.,1.));
  gl_FragColor=vec4(mix(day,nc,uNight),a);}`;
