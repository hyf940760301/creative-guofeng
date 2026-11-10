// 墨川 · 数字长卷 —— orchestration (original work).
// One rAF (gsap.ticker) drives: Lenis → scroll mapping → active scene(s) update → render A (+B during a
// transition) → composite (transition, ink drops, grain, vignette) → FXAA → DOM (cursor, magnets, tilt, modules).
import * as THREE from 'three';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import * as S from './shaders.js';
import { initBake, bake, clamp, lerp, sstep, damp, mulberry } from './util.js';
import { compositeShader, TRANS } from './composite.js';
import { createMountains } from './scenes/mountains.js';
import { createInkPool } from './scenes/inkpool.js';
import { createClouds } from './scenes/clouds.js';
import { createMuseum } from './scenes/museum.js';
import { createCallig } from './scenes/callig.js';
import { createSnow } from './scenes/snow.js';
import { createBamboo } from './scenes/bamboo.js';
import { createSeal } from './scenes/seal.js';
import { Ambient } from './audio.js';
import { initModules } from './modules.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const CAPTURE = Q.get('capture') === '1';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches && !CAPTURE;
const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches;
const root = document.documentElement;
if (CAPTURE) root.classList.add('capture');
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

// ------------------------------------------------------------ renderer + GPU tier
const C = { paper: new THREE.Color('#ece4d4'), paper2: new THREE.Color('#f3eee3'), ink: new THREE.Color('#1b1814'), tint: new THREE.Color('#8e9a96'), seal: new THREE.Color('#b23a2b'), white: new THREE.Color('#f6f2ea') };
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true }); }
catch (e) { document.body.classList.add('no-gl'); console.info('WebGL unavailable — static fallback'); }
renderer.setClearColor(C.paper, 1); renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.autoClear = true;
let TIER = 2, GPU = '';
{ const gl = renderer.getContext(); try { const e = gl.getExtension('WEBGL_debug_renderer_info'); if (e) GPU = gl.getParameter(e.UNMASKED_RENDERER_WEBGL) || ''; } catch (_) {}
  if (/swiftshader|llvmpipe|software|mali-4|adreno \(tm\) 3|powervr/i.test(GPU)) TIER = 1;
  if (TOUCH || Math.min(screen.width, screen.height) < 500) TIER = Math.min(TIER, 1);
  if (Q.get('tier')) TIER = clamp(+Q.get('tier'), 0, 2); if (CAPTURE) TIER = 2; }
const DPR_MAX = [1, 1.25, 1.5][TIER];
let dprScale = 1;
initBake(renderer);

// shared textures: tileable RGBA noise + grain
let noise = null;
const grain = (() => { const N = 256, d = new Uint8Array(N * N * 4), r = mulberry(7); for (let i = 0; i < N * N; i++) { const v = r() * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; return t; })();

// ------------------------------------------------------------ scenes (created lazily in the loader)
const FACT = { mountains: createMountains, inkpool: createInkPool, clouds: createClouds, museum: createMuseum, callig: createCallig, snow: createSnow, bamboo: createBamboo, seal: createSeal };
const SC = {};
const sections = $$('main > section[data-scene]');
const groups = []; // consecutive sections sharing a scene
sections.forEach(sec => { const id = sec.dataset.scene; const g = groups[groups.length - 1];
  if (g && g.id === id) g.secs.push(sec); else groups.push({ id, secs: [sec], trans: TRANS[sec.dataset.trans || 'none'] ?? 0, T: 0, B: 0 }); });

// ------------------------------------------------------------ render targets + fullscreen passes
const rtOpt = { depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
const rtA = new THREE.WebGLRenderTarget(4, 4, rtOpt), rtB = new THREE.WebGLRenderTarget(4, 4, rtOpt), rtC = new THREE.WebGLRenderTarget(4, 4, { ...rtOpt, depthBuffer: false });
const fsScene = new THREE.Scene(), fsCam = new THREE.Camera(), fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const comp = new THREE.ShaderMaterial({ ...compositeShader, uniforms: THREE.UniformsUtils.clone(compositeShader.uniforms), depthTest: false, depthWrite: false });
const CU = comp.uniforms; CU.uRes.value = new THREE.Vector2(1, 1); CU.uC.value = new THREE.Vector2(.5, .5); CU.uHS.value = new THREE.Vector2(.15, .15); CU.uInk.value = C.ink.clone(); CU.uPaper.value = C.paper.clone();
CU.uDropCol.value = C.ink.clone(); CU.tGrain.value = grain; CU.uDrops.value = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));
const fxaa = new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false });
const USE_FXAA = TIER > 0;
const TRANS_C = { 1: [.66, .6], 3: [.5, .62], 7: [.7, .56] }; // drop lands right of centre; dive goes into the sun

// ------------------------------------------------------------ layout / scroll mapping
let VW = innerWidth, VH = innerHeight, maxS = 1, footTop = 1e9, flow = null;
const secTop = new Map();
function measure() { OP.base = null;
  VW = innerWidth; VH = innerHeight; const sy = scrollY_;
  sections.forEach(s => { const r = s.getBoundingClientRect(); secTop.set(s, [r.top + sy, r.height]); });
  groups.forEach(g => { const a = secTop.get(g.secs[0]), b = secTop.get(g.secs[g.secs.length - 1]); g.T = a[0]; g.B = b[0] + b[1]; g.start = Math.max(0, g.T - VH); });
  maxS = Math.max(1, root.scrollHeight - VH); { const tb = $('.top'); if (tb) hdrB = tb.getBoundingClientRect().bottom + 2; }
  groups[groups.length - 1].B = maxS + VH;
  const ft = $('.foot'); footTop = ft ? ft.getBoundingClientRect().top + sy : 1e9;
  const fs = $('#flow'); if (fs) { const [t, h] = secTop.get(fs); flow = { T: t, H: h, track: $('.track', fs), w: 0 }; const lc = flow.track.lastElementChild; const gut = parseFloat(getComputedStyle(flow.track).paddingLeft) || 0; flow.w = Math.max(0, lc.offsetLeft + lc.offsetWidth + gut + (VW > 1100 ? 56 : 0) - VW); }
  mods && mods.measure && mods.measure();
}
function sizeGL() {
  VW = innerWidth; VH = innerHeight; const dpr = Math.min(devicePixelRatio || 1, DPR_MAX) * dprScale;
  renderer.setPixelRatio(dpr); renderer.setSize(VW, VH, false);
  const w = Math.max(2, Math.round(VW * dpr)), h = Math.max(2, Math.round(VH * dpr));
  rtA.setSize(w, h); rtB.setSize(w, h); rtC.setSize(w, h);
  CU.uRes.value.set(w, h); CU.uAsp.value = w / h; fxaa.uniforms.resolution.value.set(1 / w, 1 / h);
  CU.uGrainA.value = 1 / Math.max(1, dpr * .8);
  for (const k in SC) SC[k].resize(VW, VH);
}

// ------------------------------------------------------------ scroll (Lenis) + pointer
let lenis = null, scrollY_ = scrollY;
const scrollTo_ = (y, immediate) => { if (lenis) lenis.scrollTo(y, { immediate: !!immediate, duration: REDUCED ? 0 : 1.8, easing: t => 1 - Math.pow(1 - t, 4) }); else { window.scrollTo(0, y); scrollY_ = y; } };
if (!CAPTURE) { lenis = new Lenis({ lerp: REDUCED ? 1 : .085, smoothWheel: !REDUCED, wheelMultiplier: .9, touchMultiplier: 1.2, autoRaf: false });
  lenis.on('scroll', e => { scrollY_ = e.scroll; }); }
addEventListener('scroll', () => { if (!lenis) scrollY_ = scrollY; }, { passive: true });

const ptr = { cx: VW / 2, cy: VH / 2, x: 0, y: 0, sx: 0, sy: 0, in: false, moved: false, down: false };
const st = { open: 0, t: 0, dt: 1 / 60, p: 0, intro: CAPTURE ? 1 : 0, k: (REDUCED || CAPTURE) ? 1e4 : 6.5, snap: false, capture: CAPTURE, rtW: 1, rtH: 1,
  ptr: new THREE.Vector2(), ptrScreen: new THREE.Vector2(.5, .5), pointerIn: false };
const setPtr = (x, y) => { ptr.cx = x; ptr.cy = y; ptr.x = x / VW * 2 - 1; ptr.y = -(y / VH * 2 - 1); ptr.in = true; ptr.moved = true; };

// ------------------------------------------------------------ state per frame
const state = { A: 0, B: -1, tp: 0, dark: 0, lastA: -1, lastB: -1 };
const visible = new Set();
function resolve(s) {
  let A = groups.length - 1, B = -1, tp = 0;
  for (let g = 0; g < groups.length - 1; g++) { const n = groups[g + 1]; const w0 = n.T - VH * .85, w1 = n.T - VH * .15;
    if (s < w0) { A = g; break; } if (s < w1) { A = g; B = g + 1; tp = (s - w0) / (w1 - w0); break; } }
  state.A = A; state.B = B; state.tp = tp;
}
const pOf = g => { const G = groups[g]; return clamp((scrollY_ - G.start) / Math.max(1, G.B - VH - G.start)); };

// ------------------------------------------------------------ click → ink drop
let dropI = 0;
function inkDrop(x, y) {
  const u = x / VW, v = 1 - y / VH; const sA = SC[groups[state.A].id]; const own = sA && sA.click ? sA.click(u, v) === true : false;
  if (!own) CU.uDrops.value[dropI++ % 6].set(u, v, st.t, .045 + Math.random() * .03); amb.plop(); // a scene that renders its own drop (hero water) skips the screen blot
}
const INTERACTIVE = 'a,button,input,label,select,textarea,[role=tab],[role=radio],.panel,.gal,.vessel-hit,.lb,.mmenu,.top,.seals,.q-viewport,.faq,.idx,.foot,.ba';

// ------------------------------------------------------------ cursor (topmost layer; context morphs)
const cur = $('.cur'), cDot = $('.cur .dot'), cRing = $('.cur .ring'), cLab = $('.cur .lab');
const curS = { rx: VW / 2, ry: VH / 2, ctx: '', s: 1 };
const LAB = { seal: '印', drag: '拖动', brush: '' }; // seal tag sits beside the pointer so it never covers a button label
const HAS_CUR = !TOUCH && !CAPTURE && matchMedia('(hover:hover) and (pointer:fine)').matches;
if (HAS_CUR) root.classList.add('has-cur');
function cursorContext(t) {
  if (!t || !t.closest) return '';
  const d = t.closest('[data-cursor]'); if (d) return d.dataset.cursor;
  if (t.closest('a,button,[role=tab],[role=radio],label,input[type=range],.chip,.work')) return 'link';
  return '';
}
function setCursor(c) { if (c === curS.ctx) return; cur.classList.remove('c-' + curS.ctx); curS.ctx = c; if (c) cur.classList.add('c-' + c); cLab.textContent = LAB[c] || ''; }

// ------------------------------------------------------------ magnets + tilt (transform only; rects cached on enter)
const mags = [], tilts = [];
function bindFX() {
  if (!HAS_CUR) return;
  $$('.mag').forEach(el => { const m = { el, x: 0, y: 0, tx: 0, ty: 0, r: null }; mags.push(m);
    el.addEventListener('pointerenter', () => { m.r = el.getBoundingClientRect(); amb.tick(); });
    el.addEventListener('pointerleave', () => { m.r = null; m.tx = m.ty = 0; }); });
  $$('.tilt').forEach(el => { const c = { el, rx: 0, ry: 0, tx: 0, ty: 0, r: null, on: false }; tilts.push(c);
    el.addEventListener('pointerenter', () => { c.r = el.getBoundingClientRect(); c.on = true; el.classList.add('hover'); });
    el.addEventListener('pointerleave', () => { c.on = false; c.tx = c.ty = 0; el.classList.remove('hover'); }); });
  addEventListener('scroll', () => { for (const m of mags) if (m.r) m.r = m.el.getBoundingClientRect(); for (const c of tilts) if (c.on) c.r = c.el.getBoundingClientRect(); }, { passive: true });
}
function domFX(dt) {
  // cursor
  if (HAS_CUR) {
    curS.rx = damp(curS.rx, ptr.cx, 22, dt); curS.ry = damp(curS.ry, ptr.cy, 22, dt);
    curS.s = damp(curS.s, ptr.down ? .82 : 1, 18, dt);
    cDot.style.transform = `translate3d(${ptr.cx}px,${ptr.cy}px,0)`;
    cRing.style.transform = `translate3d(${curS.rx.toFixed(1)}px,${curS.ry.toFixed(1)}px,0) scale(${curS.s.toFixed(3)})`;
    cLab.style.transform = `translate3d(${curS.rx.toFixed(1)}px,${curS.ry.toFixed(1)}px,0) translate(-50%,-50%)`;
  }
  for (const m of mags) { if (m.r) { const cx = m.r.left + m.r.width / 2, cy = m.r.top + m.r.height / 2; m.tx = (ptr.cx - cx) * .28; m.ty = (ptr.cy - cy) * .32;
      m.el.style.setProperty('--bx', ((ptr.cx - m.r.left) / m.r.width * 100).toFixed(1) + '%'); m.el.style.setProperty('--by', ((ptr.cy - m.r.top) / m.r.height * 100).toFixed(1) + '%'); }
    const nx = damp(m.x, m.tx, 12, dt), ny = damp(m.y, m.ty, 12, dt);
    if (Math.abs(nx - m.x) + Math.abs(ny - m.y) > .01) { m.x = nx; m.y = ny; m.el.style.transform = Math.abs(nx) + Math.abs(ny) < .05 ? '' : `translate3d(${nx.toFixed(2)}px,${ny.toFixed(2)}px,0)`; } }
  for (const c of tilts) { if (c.on && c.r) { const u = (ptr.cx - c.r.left) / c.r.width, v = (ptr.cy - c.r.top) / c.r.height; c.ty = (u - .5) * 8; c.tx = -(v - .5) * 6;
      c.el.style.setProperty('--mx', (u * 100).toFixed(1) + '%'); c.el.style.setProperty('--my', (v * 100).toFixed(1) + '%'); }
    const a = damp(c.rx, c.tx, 10, dt), b = damp(c.ry, c.ty, 10, dt);
    if (Math.abs(a - c.rx) + Math.abs(b - c.ry) > .003) { c.rx = a; c.ry = b; c.el.style.transform = Math.abs(a) + Math.abs(b) < .01 ? '' : `perspective(1000px) rotateX(${a.toFixed(2)}deg) rotateY(${b.toFixed(2)}deg)`; } }
}

// ------------------------------------------------------------ chrome: header theme, veil, mount bands, seals, menu highlight, pin
const tf = $('.topfade'), tfK = $('.topfade .k'), tfP = $('.topfade .p'), mT = $('.mount .mt'), mB = $('.mount .mb'), barI = $('.scrollbar i');
const seals = $('.seals');
sections.forEach(s => { const a = document.createElement('a'); a.href = '#' + s.id; a.setAttribute('aria-label', s.dataset.seal); a.innerHTML = `<span class="sl">${s.dataset.seal}</span><span class="st" aria-hidden="true">${s.dataset.seal[0]}</span>`; seals.appendChild(a); });
const sealA = $$('a', seals), menuA = $$('.menu a');
const cache = { fadeSec: null, fo: -1, fadeIn: null, fiv: -1, veil: -1, dk: -1, mk: -1, bar: -1, sec: -1, darkBody: null, pinX: -1, foot: null };
// header-safe zone: text that scrolls (or un-pins) up toward the fixed header dissolves just before it, never sits under it
const SAFE = $$('main h1:not(.op-title), main .kicker, main h2, main h3, main .sec-h > p, main .blk > p'); let hdrB = 72;
$$('main .panel:not(.step)').forEach(e => { e._fl = 120; SAFE.push(e); });   // big cards dissolve over a longer band as they leave under the header
const safeFX = () => { const n = SAFE.length, tops = new Array(n), bots = new Array(n);
  for (let i = 0; i < n; i++) { const r = SAFE[i].getBoundingClientRect(); tops[i] = r.top; bots[i] = r.bottom; }   // all reads first
  for (let i = 0; i < n; i++) { const e = SAFE[i]; const X = hdrB - tops[i]; let v = '';
    if (bots[i] > -10 && X > -44) { const a = Math.round(X - 6), b = Math.round(X + (SAFE[i]._fl || 38)); v = `linear-gradient(180deg,transparent ${a}px,#000 ${b}px)`; }
    if (v !== e._m) { e._m = v; e.style.webkitMaskImage = v; e.style.maskImage = v; } } };
// 破墨入卷: the hero title flies up-left and becomes the 墨 seal; the chapter-1 seal lights when the night scroll opens
const opT = $('.op-title'), opSide = $('.op-side'), opFade = $('.op-fade'), heroEl = $('#hero'), visEl = $('#vision'), bSeal = $('.top .b-seal');
const OP = { o: -1, base: null, night: -1, pulsed: false, lit: false };
function opMeasure() { const tr = opT.style.transform; opT.style.transform = 'none'; const r = opT.getBoundingClientRect(), b = bSeal.getBoundingClientRect(), pt = opT.closest('.hero-pin').getBoundingClientRect().top; opT.style.transform = tr;
  OP.base = { x: r.left, y: r.top - pt, h: r.height, w: r.width, bx: b.left, by: b.top, bh: b.height }; OP.o = -1; }
function openFX(o) { if (!OP.base) opMeasure(); if (Math.abs(o - OP.o) < 1e-4 && !CAPTURE) return; OP.o = o; const B_ = OP.base;
  const f = sstep(0, .3, o), e = f * f * (3 - 2 * f), sc = Math.exp(lerp(0, Math.log(B_.bh * 1.6 / B_.w), e)), arc = Math.sin(f * Math.PI) * -B_.h * .3;
  // the title's centre lands on the 墨 seal's centre as it shrinks to seal width, then sinks into it
  const tx = (B_.bx + B_.bh / 2 - B_.w * sc / 2 - B_.x) * e, ty = (B_.by + B_.bh / 2 - B_.h * sc / 2 - B_.y) * e + arc;
  opT.style.transform = o < 1e-4 ? '' : `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;
  opT.style.opacity = o < 1e-4 ? '' : (1 - sstep(.21, .3, o)).toFixed(3);
  const fo = 1 - sstep(0, .15, o); opSide.style.opacity = fo > .999 ? '' : fo.toFixed(3); opFade.style.opacity = fo > .999 ? '' : fo.toFixed(3); opFade.style.visibility = fo < .002 ? 'hidden' : '';
  const pz = o > .28; if (pz !== OP.pulsed) { OP.pulsed = pz; if (pz) { bSeal.classList.remove('pulse'); void bSeal.offsetWidth; bSeal.classList.add('pulse'); } }
  const nd = o >= .62; if (nd !== OP.night) { OP.night = nd; heroEl.classList.toggle('dark', nd); visEl.classList.toggle('dark', nd); } }
function chrome() {
  const s = scrollY_; if (CAPTURE) for (const k in cache) if (k !== 'darkBody' && k !== 'fadeSec' && k !== 'fadeIn') cache[k] = -1e9; // capture: always write (history-free DOM)
  safeFX();
  // when the theme flips (dark ↔ paper), the outgoing chapter's copy yields to the transition instead of sitting on a fresh stroke
  { const gA = groups[state.A], gB = state.B >= 0 ? groups[state.B] : null; let fs = null, fo = 1;
    if (gB && gB.trans === TRANS.fog && SC[gA.id].dark === SC[gB.id].dark) { fs = gA.secs[gA.secs.length - 1]; fo = 1 - sstep(.0, .3, state.tp); }   // the fog swallows the outgoing chapter's cards
    else if (gB && SC[gA.id].dark !== SC[gB.id].dark) { fs = gA.secs[gA.secs.length - 1]; fo = gB.trans === 6 ? 1 - sstep(.0, .14, state.tp) : gB.trans === 1 ? 1 - sstep(.04, .3, state.tp) : 1 - sstep(.28, .55, state.tp); }   // 清水: the night copy washes away with the ink // tear: cards clear before the paper splits
    if (fs !== cache.fadeSec) { if (cache.fadeSec && cache.fadeSec.style) cache.fadeSec.style.opacity = ''; cache.fadeSec = fs; cache.fo = -1; }
    if (fs && Math.abs(fo - cache.fo) > .003) { cache.fo = fo; fs.style.opacity = fo > .997 ? '' : fo.toFixed(3); }
    let fi = null, fv = 1; if (gB && SC[gA.id].dark !== SC[gB.id].dark) { fi = gB.secs[0]; fv = gB.trans === 3 ? sstep(.66, .9, state.tp) : sstep(.45, .75, state.tp); }
    if (fi !== cache.fadeIn) { if (cache.fadeIn && cache.fadeIn.style) cache.fadeIn.style.opacity = ''; cache.fadeIn = fi; cache.fiv = -1; }
    if (fi && Math.abs(fv - cache.fiv) > .003) { cache.fiv = fv; fi.style.opacity = fv > .997 ? '' : fv.toFixed(3); } }
  const veil = sstep(VH * .2, VH * .65, s); if (Math.abs(veil - cache.veil) > .003) { cache.veil = veil; tf.style.opacity = veil.toFixed(3); }
  const footDark = s + 70 > footTop; let dk = footDark ? 1 : state.dark; if (Math.abs(dk - cache.dk) > .003) { cache.dk = dk; tfK.style.opacity = dk.toFixed(3); tfP.style.opacity = (1 - dk).toFixed(3); }
  const bd = dk > .5; if (bd !== cache.darkBody) { cache.darkBody = bd; document.body.classList.toggle('dark', bd); }
  const mk = sstep(0, VH * .55, s) * (CAPTURE ? 1 : 1) + (1 - st.intro); const mkv = Math.min(1, mk);
  if (Math.abs(mkv - cache.mk) > .002) { cache.mk = mkv; mT.style.transform = `translate3d(0,${(-mkv * 105).toFixed(2)}%,0)`; mB.style.transform = `translate3d(0,${(mkv * 105).toFixed(2)}%,0)`; }
  const b = s / maxS; if (Math.abs(b - cache.bar) > .001) { cache.bar = b; barI.style.transform = `scaleX(${b.toFixed(4)})`; }
  let si = 0; for (let i = 0; i < sections.length; i++) if (secTop.get(sections[i])[0] - VH * .45 <= s) si = i;
  if (si === 0 && st.open > .88) si = 1; const lit = si === 1 && st.open > .88 && st.open < 1.2; if (lit !== OP.lit) { OP.lit = lit; if (lit && sealA[1]) { sealA[1].classList.remove('lit'); void sealA[1].offsetWidth; sealA[1].classList.add('lit'); } }
  if (si !== cache.sec) { cache.sec = si; sealA.forEach((a, i) => a.classList.toggle('on', i === si)); const id = sections[si].id;
    menuA.forEach(a => { const on = a.getAttribute('href') === '#' + id || false; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'); }); }
  if (flow && VW > 760) { const lp = clamp((s - flow.T) / Math.max(1, flow.H - VH)); const x = -lp * flow.w;
    if (Math.abs(x - cache.pinX) > .2) { cache.pinX = x; flow.track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`; } mods.flowProgress(lp); }
}

// ------------------------------------------------------------ frame
let first = true;
function frame(dt, draw = true) {
  st.t += REDUCED ? dt * .4 : dt; st.dt = dt;
  // pointer smoothing (scenes get a calm, damped pointer)
  st.ptr.set(damp(st.ptr.x, ptr.x, 4, dt), damp(st.ptr.y, ptr.y, 4, dt)); st.ptrScreen.set(ptr.cx / VW, 1 - ptr.cy / VH); st.pointerIn = ptr.in && (!CAPTURE || !!window.__dye);
  resolve(scrollY_); st.open = clamp(scrollY_ / VH); openFX(st.open);
  const A = state.A, B = state.B, tp = state.tp;
  const gA = groups[A], sA = SC[gA.id];
  const gB = B >= 0 ? groups[B] : null, sB = gB ? SC[gB.id] : null;
  const ease = REDUCED ? tp : tp; // transitions are linear in scroll; each shader shapes its own curve
  state.dark = lerp(sA.dark, sB ? sB.dark : sA.dark, sstep(.35, .65, tp));
  st.rtW = rtA.width; st.rtH = rtA.height;
  // update + render only what is visible this frame
  const want = sB && sB !== sA ? [sA, sB] : [sA];
  for (const sc of want) { st.snap = first || !visible.has(sc) || CAPTURE && false; const gi = sc === sA ? A : B; st.p = pOf(gi); st.span = Math.max(1, groups[gi].B - VH - groups[gi].start); sc.update(st); }
  visible.clear(); want.forEach(s => visible.add(s)); first = false; const _t1 = BENCH ? performance.now() : 0;
  if (!draw) return;
  const OPEN = sA.setNight && !sB && st.open > .22 && st.open < .9;   // 破墨入卷 match-cut: ink-on-paper in A, night-ink version of the same frame in B
  if (sA.setNight) sA.setNight(OPEN ? 0 : sstep(.88, .9, st.open));
  renderer.setRenderTarget(rtA); renderer.setClearColor(sA.dark && !OPEN ? 0x14120f : C.paper, 1); renderer.clear(); renderer.render(sA.scene, sA.camera);
  if (OPEN) { sA.setNight(1); renderer.setRenderTarget(rtB); renderer.setClearColor(0x0a0a0c, 1); renderer.clear(); renderer.render(sA.scene, sA.camera); }
  if (sB && sB !== sA) { renderer.setRenderTarget(rtB); renderer.setClearColor(sB.dark ? 0x14120f : C.paper, 1); renderer.clear(); renderer.render(sB.scene, sB.camera); }
  CU.tA.value = rtA.texture; CU.tB.value = sB || OPEN ? rtB.texture : rtA.texture; CU.uP.value = sB ? ease : OPEN ? (REDUCED ? sstep(.3, .88, st.open) : st.open) : 0;
  CU.uType.value = sB ? (REDUCED ? 0 : gB.trans) : OPEN ? (REDUCED ? 0 : 8) : 0; CU.uT.value = st.t; const cc = TRANS_C[gB ? gB.trans : 0]; CU.uC.value.set(cc ? cc[0] : .5, cc ? cc[1] : .5); if (sB && sB.anchor && gB.trans === 7) { const an = sB.anchor(VW / VH); CU.uC.value.set(an[0], an[1]); CU.uHS.value.set(an[2], an[3]); }
  if (OPEN) CU.uC.value.set(.5, VW < VH ? .47 : .44);
  CU.uDropCol.value.copy(state.dark > .5 ? C.seal : C.ink);
  fsQuad.material = comp;
  if (USE_FXAA) { renderer.setRenderTarget(rtC); renderer.render(fsScene, fsCam); fxaa.uniforms.tDiffuse.value = rtC.texture; fsQuad.material = fxaa; }
  renderer.setRenderTarget(null); renderer.render(fsScene, fsCam);
  const _t2 = BENCH ? performance.now() : 0; chrome(); domFX(dt); mods.tick(st.t, dt, CAPTURE);
  if (BENCH) FT.seg = [want.map(s => s.id || '').join('+'), _t1, _t2, performance.now()];
}

// ------------------------------------------------------------ adaptive resolution
let acc = 0, frames = 0, cool = 0;
function adapt(dt) { if (CAPTURE) return; acc += dt; frames++; cool -= dt;
  if (acc > .5) { const ms = acc / frames * 1000; acc = 0; frames = 0;
    if (cool <= 0) { if (ms > 20 && dprScale > .6) { dprScale = Math.max(.6, dprScale - .1); sizeGL(); cool = 1.2; } else if (ms < 12.5 && dprScale < 1) { dprScale = Math.min(1, dprScale + .05); sizeGL(); cool = 2.5; } } } }

// ------------------------------------------------------------ loop
let last = 0; const BENCH = Q.get('bench') === '1'; const FT = window.__ft = { js: [], dt: [] };
function loop(time) {
  const p0 = BENCH ? performance.now() : 0; const now = time * 1000; const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60; last = now;
  if (lenis) lenis.raf(now);
  frame(dt); adapt(dt);
  if (BENCH) { const e = performance.now(); if (e - p0 > 100) (FT.big = FT.big || []).push([FT.seg && FT.seg[0], Math.round(FT.seg[1] - p0), Math.round(FT.seg[2] - FT.seg[1]), Math.round(FT.seg[3] - FT.seg[2]), Math.round(e - FT.seg[3]), dprScale]); FT.js.push(e - p0); FT.dt.push(dt * 1000); }
}

// ------------------------------------------------------------ audio
const amb = new Ambient(); const sb = $('.snd');
sb.addEventListener('click', () => { const on = amb.toggle(); sb.classList.toggle('on', on); sb.setAttribute('aria-pressed', on); $('.snd-t').textContent = on ? '声 开' : '声 关'; });

// ------------------------------------------------------------ split text for per-character ink-bleed reveal
$$('[data-split]').forEach(el => { const txt = el.textContent; el.setAttribute('aria-label', txt); el.textContent = '';
  [...txt].forEach((ch, i) => { const s = document.createElement('span'); s.className = 'c'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', i); s.textContent = ch === ' ' ? '\u00a0' : ch;
    const prev = el.lastChild; if (prev && '，。、；：！？）」』》'.includes(ch)) { let w = prev; if (!prev.classList.contains('nw')) { w = document.createElement('span'); w.className = 'nw'; el.replaceChild(w, prev); w.appendChild(prev); } w.appendChild(s); } else el.appendChild(s); }); });

// ------------------------------------------------------------ modules (DOM product UI)
let mods = { tick() {}, measure() {}, flowProgress() {} };
const api = {
  get lenis() { return lenis; }, scrollTo: (y, imm) => scrollTo_(y, imm), get flow() { return flow; }, amb, CAPTURE, REDUCED, TOUCH,
  museum: () => SC.museum, setPatina: v => SC.museum && SC.museum.setPatina(v), get VH() { return VH; },
  lock(on) { if (!lenis) return; on ? lenis.stop() : lenis.start(); },
};

// ------------------------------------------------------------ events
addEventListener('pointermove', e => { setPtr(e.clientX, e.clientY); if (HAS_CUR) { cur.classList.add('vis'); setCursor(cursorContext(e.target)); } if (drag && SC.museum) SC.museum.dragMove(e.clientX, e.clientY, st.dt); }, { passive: true });
document.addEventListener('pointerleave', () => { ptr.in = false; cur.classList.remove('vis'); });
addEventListener('blur', () => { ptr.down = false; });
let drag = false, downAt = null;
addEventListener('pointerdown', e => { ptr.down = true; downAt = [e.clientX, e.clientY, performance.now()];
  if (e.target.closest && e.target.closest('.vessel-hit') && SC.museum) { drag = true; SC.museum.dragStart(e.clientX, e.clientY); e.target.setPointerCapture?.(e.pointerId); } }, { passive: true });
addEventListener('pointerup', e => { ptr.down = false; if (drag) { drag = false; SC.museum.dragEnd(); }
  if (downAt && !CAPTURE && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6 && performance.now() - downAt[2] < 400 && !(e.target.closest && e.target.closest(INTERACTIVE)) && e.button === 0) inkDrop(e.clientX, e.clientY);
  downAt = null; }, { passive: true });
addEventListener('pointercancel', () => { ptr.down = false; if (drag) { drag = false; SC.museum.dragEnd(); } });
// in-page anchors → smooth Lenis scroll (+ focus target for a11y)
document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return; const id = a.getAttribute('href').slice(1); const t = id ? document.getElementById(id) : null; if (!t) return;
  e.preventDefault(); mods.closeMenu && mods.closeMenu(); let y = t.getBoundingClientRect().top + scrollY_; if (t.id === 'hero') y = 0; scrollTo_(Math.min(maxS, Math.max(0, y)), false);
  if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: true }); history.replaceState(null, '', '#' + id); });
let rz = 0; addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { sizeGL(); measure(); }); }, { passive: true });

// ------------------------------------------------------------ boot: bake + compile spread across loader frames (real progress)
const STEPS = ['研墨', '铺纸', '起稿', '勾皴', '设色', '题款', '钤印'];
async function boot() {
  const ld = $('#loader'), bar = $('.ld-bar i'), num = $('.ld-num'), step = $('.ld-step');
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  const tasks = [];
  tasks.push(() => { noise = bake(new THREE.ShaderMaterial({ vertexShader: S.FS_VERT, fragmentShader: S.noiseTileFrag }), 256, 256, { wrap: true }); CU.tN.value = noise; });
  const ctx = () => ({ TIER, C, noise, renderer, CAPTURE });
  const order = ['mountains', 'inkpool', 'clouds', 'museum', 'callig', 'snow', 'bamboo', 'seal'];
  for (const id of order) {
    tasks.push(() => { SC[id] = FACT[id](ctx()); const j = SC[id].jobs; tasks.splice(tasks.indexOf(this_) + 1, 0, ...j.map(fn => fn), () => SC[id].finish(), () => { SC[id].resize(VW, VH); renderer.compile(SC[id].scene, SC[id].camera); }); });
  }
  let this_ = null, done = 0;
  for (let i = 0; i < tasks.length; i++) { this_ = tasks[i]; this_(); done++;
    const pct = Math.round(done / tasks.length * 100); if (ld) { bar.style.transform = `scaleX(${pct / 100})`; num.textContent = pct + '%'; ld.setAttribute('aria-valuenow', pct); step.textContent = STEPS[Math.min(STEPS.length - 1, Math.floor(done / tasks.length * STEPS.length))]; }
    if (!CAPTURE) await nextFrame(); }
  sizeGL(); measure();
  mods = initModules(api) || mods; measure();
  // warm the compositor + FXAA programs
  fsQuad.material = comp; renderer.compile(fsScene, fsCam); fsQuad.material = fxaa; renderer.compile(fsScene, fsCam);
  // prewarm: actually draw every scene once (drivers link programs / upload textures on first draw, not on compile)
  const warmTex = o => { const ms = o.material ? [].concat(o.material) : []; for (const m of ms) { for (const k in m) if (m[k] && m[k].isTexture) renderer.initTexture(m[k]); if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture && !v.isRenderTargetTexture) renderer.initTexture(v); } } };
  for (const id in SC) SC[id].scene.traverse(warmTex);
  for (const id in SC) { st.p = 0; st.snap = true; SC[id].update(st); renderer.setRenderTarget(rtB); renderer.render(SC[id].scene, SC[id].camera); }
  CU.tA.value = rtA.texture; CU.tB.value = rtB.texture; for (const ty of [0, 1, 2, 3, 4, 5, 6, 7]) { CU.uType.value = ty; fsQuad.material = comp; renderer.setRenderTarget(rtC); renderer.render(fsScene, fsCam); }
  if (USE_FXAA) { fsQuad.material = fxaa; fxaa.uniforms.tDiffuse.value = rtC.texture; } renderer.setRenderTarget(null); renderer.render(fsScene, fsCam); first = true;
  bindFX();
  new ResizeObserver(() => measure()).observe($('main'));
  if (CAPTURE) return captureMode();
  gsap.ticker.lagSmoothing(0); gsap.ticker.add(loop); intro();
  window.__perf = { tier: TIER, gpu: GPU, get dpr() { return renderer.getPixelRatio(); }, get scale() { return dprScale; } };
  window.__ready = true;
}
function reveals() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); mods.onReveal && mods.onReveal(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  $$('[data-split],[data-reveal]').forEach(el => { if (!el.closest('#hero')) io.observe(el); });
}
function intro() {
  const ld = $('#loader'); lenis && lenis.stop();
  const o = { v: 0 };
  const tl = gsap.timeline();
  tl.to('.ld-mid', { opacity: 0, y: -12, duration: .45, ease: 'power2.in' })
    .to('.roller.l', { x: () => -innerWidth / 2 + 120, duration: REDUCED ? .1 : 1.7, ease: 'expo.inOut' }, '<.15')
    .to('.roller.r', { x: () => innerWidth / 2 - 120, duration: REDUCED ? .1 : 1.7, ease: 'expo.inOut' }, '<')
    .fromTo('.ld-paper.l', { clipPath: 'inset(0 0% 0 0)' }, { clipPath: 'inset(0 100% 0 0)', duration: REDUCED ? .1 : 1.7, ease: 'expo.inOut' }, '<')
    .fromTo('.ld-paper.r', { clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 100%)', duration: REDUCED ? .1 : 1.7, ease: 'expo.inOut' }, '<')
    .to('.roller', { opacity: 0, duration: .4 }, '>-.35')
    .to(o, { v: 1, duration: REDUCED ? .1 : 2.6, ease: 'power1.inOut', onUpdate: () => { st.intro = o.v; } }, '<-.9')
    .add(() => $('.op-title').classList.add('in'), '<.4')
    .fromTo(['.op-seal', '.op-sub'], { opacity: 0, scale: 1.5 }, { opacity: 1, scale: 1, duration: .9, ease: 'expo.out', stagger: .14 }, '<.5')
    .fromTo(['.top', '.seals', '.scrollbar', '.op-en', '.op-cue'], { opacity: 0 }, { opacity: 1, duration: 1, ease: 'power2.out', stagger: .05 }, '<.2')
    .add(() => { ld.remove(); lenis && lenis.start(); reveals(); }, '<');
}
function captureMode() {
  $('#loader').remove(); ['.top', '.seals', '.scrollbar', '.op-en', '.op-cue', '.op-seal', '.op-sub'].forEach(s => $$(s).forEach(e => e.style.opacity = 1));
  $$('[data-split],[data-reveal]').forEach(e => e.classList.add('in')); mods.finalize && mods.finalize();
  window.__capture = true; window.__SC = SC;
  window.__setScroll = p => { measure(); window.scrollTo(0, clamp(p) * maxS); scrollY_ = scrollY; return scrollY_; };
  window.__setScrollY = y => { window.scrollTo(0, y); scrollY_ = scrollY; return scrollY_; };
  window.__setPointer = (x, y) => setPtr(x, y);
  window.__setIntro = v => { st.intro = clamp(v); };
  window.__drop = (x, y) => inkDrop(x, y);
  window.__setTime = tt => { const target = Math.max(0, tt); let steps = Math.round((target - st.t) * 60);
    if (steps < 0) first = true;                              // going back in time: re-snap everything
    const n = clamp(Math.abs(steps), 1, 240); st.t = target - n / 60; // exact final time regardless of history
    for (let i = 0; i < n; i++) frame(1 / 60, i === n - 1); return st.t; };
  window.__benchRender = (n = 20) => { const gl = renderer.getContext(); const out = []; for (let i = 0; i < n; i++) { const a = performance.now(); frame(1 / 60); gl.finish(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(performance.now() - a); } out.sort((x, y) => x - y); return { p50: +out[n >> 1].toFixed(1), p95: +out[Math.floor(n * .95)].toFixed(1) }; };
  window.__metrics = () => ({ maxS, VH, groups: groups.map(g => ({ id: g.id, T: g.T, B: g.B })), secs: sections.map(s => [s.id, ...secTop.get(s)]) });
  window.__state = () => ({ ...state, A: groups[state.A].id, B: state.B >= 0 ? groups[state.B].id : null });
  window.__perf = { tier: TIER, gpu: GPU };
  window.__setTime(0); window.__ready = true;
}
boot().catch(e => { console.error(e); });
