// Product UI modules: playground, before/after, feature tabs + route drawing, patina, layout demo, workflow
// timeline, gallery + lightbox, testimonials, stats, pricing toggle, FAQ, waitlist form, mobile menu.
// Everything animates from the main loop's tick() (no extra rAF loops).
import { paintLayers, compose, STYLES } from './painter.js';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = t => 1 - Math.pow(1 - clamp(t), 3);

export function initModules(api) {
  const { CAPTURE, REDUCED } = api;
  const anims = new Set(); // {t0,dur,fn} driven by tick
  let now = CAPTURE ? 0 : performance.now() / 1000;
  const animate = (dur, fn, done) => { const a = { t0: now, dur: CAPTURE || REDUCED ? 0 : dur, fn, done }; anims.add(a); if (!a.dur) { fn(1); done && done(); anims.delete(a); } return a; };
  const M = {};

  // ---------------- mobile menu
  const burger = $('.burger'), mm = $('#mmenu');
  const setMenu = on => { burger.setAttribute('aria-expanded', on); burger.setAttribute('aria-label', on ? '关闭菜单' : '打开菜单'); document.body.classList.toggle('menu-open', on);
    if (on) { mm.hidden = false; requestAnimationFrame(() => mm.classList.add('open')); api.lock(true); $('a', mm).focus(); } else { mm.classList.remove('open'); mm.hidden = true; api.lock(false); } };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  M.closeMenu = () => { if (burger.getAttribute('aria-expanded') === 'true') setMenu(false); };
  addEventListener('keydown', e => { if (e.key === 'Escape') { M.closeMenu(); closeLB(); } });

  // ---------------- stats count-up
  const counted = new WeakSet();
  const fmt = (v, d) => d ? v.toFixed(d) : Math.round(v).toLocaleString('zh-CN');
  const countUp = el => { if (counted.has(el)) return; counted.add(el); $$('[data-count]', el).forEach((b, i) => { const to = +b.dataset.count, d = +(b.dataset.dec || 0);
    animate(1.6 + i * .15, k => b.textContent = fmt(to * ease(k), d)); }); };

  // ---------------- playground
  const pf = $('#playForm'), pin = $('#prompt'), pcv = $('#playCv'), pst = $('#playSt'), pbtn = $('button[type=submit]', pf), den = $('#inkDen');
  let play = null;
  const styleOf = () => ($('input[name=style]:checked', pf) || {}).value || 'xieyi';
  const applyDen = () => { const v = den.value / 100; den.style.setProperty('--v', den.value + '%'); pcv.style.filter = `contrast(${(.75 + v * .55).toFixed(2)}) brightness(${(1.07 - v * .12).toFixed(2)})`; };
  den.addEventListener('input', applyDen); applyDen();
  function paint(animated = true) {
    const txt = pin.value.trim();
    if (!txt) { pin.setAttribute('aria-invalid', 'true'); pst.textContent = '请先写一句描述'; pst.classList.remove('busy'); pin.focus(); return; }
    pin.removeAttribute('aria-invalid');
    const t0 = performance.now(); const layers = paintLayers(pcv.width, pcv.height, txt, styleOf());
    pbtn.disabled = true; pst.textContent = `落墨中 · ${STYLES[styleOf()].name}`; pst.classList.add('busy');
    if (play) anims.delete(play);
    play = animate(animated ? 1.8 : 0, k => compose(pcv, layers, ease(k)), () => { pbtn.disabled = false; pst.classList.remove('busy'); pst.textContent = `完成 · ${layers.length} 层 · ${((performance.now() - t0) / 1000).toFixed(1)} 秒`; });
  }
  pf.addEventListener('submit', e => { e.preventDefault(); paint(true); });
  pin.addEventListener('input', () => { if (pin.value.trim()) { pin.removeAttribute('aria-invalid'); if (pst.textContent === '请先写一句描述') pst.textContent = '就绪'; } });
  $$('.chip', pf).forEach(c => c.addEventListener('click', () => { pin.value = c.dataset.p; paint(true); }));
  $$('input[name=style]', pf).forEach(r => r.addEventListener('change', () => paint(true)));

  // ---------------- before / after
  const ba = $('#ba'), baR = $('.ba-r', ba);
  const baSet = v => { ba.style.setProperty('--ba', v + '%'); baR.setAttribute('aria-valuetext', `成画占 ${100 - v}%`); };
  baR.addEventListener('input', () => baSet(baR.value)); baSet(50);
  let baDone = false; const paintBA = () => { if (baDone) return; baDone = true; const a = $('.ba-a', ba), b = $('.ba-b', ba);
    compose(a, paintLayers(a.width, a.height, '远山 江 舟 松 云', 'sketch', 3), 1); compose(b, paintLayers(b.width, b.height, '远山 江 舟 松 云', 'xieyi', 3), 1); };

  // ---------------- feature tabs
  const tabs = $$('[role=tab]', $('.tabs')), ink = $('.tab-ink');
  const moveInk = t => { ink.style.setProperty('--x', t.offsetLeft + 'px'); ink.style.setProperty('--w', t.offsetWidth + 'px'); };
  const select = (i, focus) => { tabs.forEach((t, j) => { const on = i === j; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; const p = $('#' + t.getAttribute('aria-controls'));
      if (on) { p.hidden = false; p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); } else p.hidden = true; });
    moveInk(tabs[i]); if (focus) tabs[i].focus(); amb().tick(); };
  tabs.forEach((t, i) => { t.addEventListener('click', () => select(i)); t.addEventListener('keydown', e => { const k = e.key; let j = -1;
    if (k === 'ArrowRight') j = (i + 1) % tabs.length; else if (k === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length; else if (k === 'Home') j = 0; else if (k === 'End') j = tabs.length - 1;
    if (j >= 0) { e.preventDefault(); select(j, true); } }); });
  M.measure = () => { moveInk(tabs.find(t => t.getAttribute('aria-selected') === 'true')); };
  function amb() { return api.amb; }

  // route drawing (SVG) — birds follow the drawn path
  const svg = $('.route'), rp = $('.rt-path', svg), guide = $('.rt-guide', svg), birdsG = $('.rt-birds', svg);
  const birds = [0, 1, 2, 3, 4].map(() => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'M-7 -2 Q-3 -1 0 1 Q3 -1 7 -3 Q3 0 0 3 Q-3 0 -7 -2Z'); birdsG.appendChild(p); return p; });
  let pts = [], drawing = false, routeEl = guide;
  const sp = svg.createSVGPoint(); const toSvg = e => { const m = svg.getScreenCTM(); sp.x = e.clientX; sp.y = e.clientY; const q = m ? sp.matrixTransform(m.inverse()) : sp; return [Math.max(4, Math.min(396, q.x)), Math.max(4, Math.min(216, q.y))]; };
  svg.addEventListener('pointerdown', e => { drawing = true; pts = [toSvg(e)]; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
  svg.addEventListener('pointermove', e => { if (!drawing) return; const p = toSvg(e), l = pts[pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 4) { pts.push(p); rp.setAttribute('d', 'M' + pts.map(q => q.map(v => v.toFixed(1)).join(' ')).join(' L')); } });
  const endDraw = () => { if (!drawing) return; drawing = false; if (pts.length > 4) { routeEl = rp; guide.style.opacity = .35; } };
  svg.addEventListener('pointerup', endDraw); svg.addEventListener('pointercancel', endDraw);
  $('.rt-clear').addEventListener('click', () => { rp.setAttribute('d', ''); routeEl = guide; guide.style.opacity = 1; pts = []; });
  const tp1 = $('#tp-1');
  function tickBirds(t) { if (tp1.hidden) return; const L = routeEl.getTotalLength(); if (!L) return;
    birds.forEach((b, i) => { const u = ((t * .09 + i * .045) % 1) * L; const a = routeEl.getPointAtLength(u), c = routeEl.getPointAtLength(Math.min(L, u + 2)); const flap = Math.sin(t * 9 + i * 1.7) * .5 + .7;
      b.setAttribute('transform', `translate(${(a.x + Math.sin(i * 2.1) * 6).toFixed(1)} ${(a.y + Math.cos(i * 1.3) * 6).toFixed(1)}) rotate(${(Math.atan2(c.y - a.y, c.x - a.x) * 57.3).toFixed(1)}) scale(1 ${flap.toFixed(2)})`); }); }

  // ---------------- patina
  const pat = $$('.patina button');
  pat.forEach(b => b.addEventListener('click', () => { pat.forEach(x => x.setAttribute('aria-checked', x === b)); api.setPatina(+b.dataset.v); }));
  pat.forEach((b, i) => b.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const j = (i + (e.key === 'ArrowRight' ? 1 : pat.length - 1)) % pat.length; pat[j].focus(); pat[j].click(); } }));
  api.setPatina(1);

  // ---------------- layout demo
  const lp = $('#layPrev');
  $$('input[name=dir]').forEach(r => r.addEventListener('change', () => lp.dataset.dir = r.value));
  $$('input[name=sealpos]').forEach(r => r.addEventListener('change', () => lp.dataset.seal = r.value));

  // ---------------- workflow timeline (two-way bound to the pinned horizontal scroll)
  const tl = $('#tl'), steps = $$('.track .step'), ticks = $$('.tl-ticks li'), names = ['生成', '筛选', '调色', '题款', '导出'], NUM = '一二三四五';
  let tlDrag = false, lastStep = -1;
  tl.addEventListener('pointerdown', () => tlDrag = true); addEventListener('pointerup', () => tlDrag = false);
  tl.addEventListener('input', () => { const f = api.flow; if (!f) return; api.scrollTo(f.T + tl.value / 100 * (f.H - api.VH), true); });
  M.flowProgress = lp_ => { const v = Math.round(lp_ * 100); if (!tlDrag && +tl.value !== v) tl.value = v; tl.style.setProperty('--v', v + '%');
    const si = Math.min(4, Math.floor(lp_ * 5 - 1e-6 + .0001)); const s = Math.max(0, si);
    if (s !== lastStep) { lastStep = s; steps.forEach((el, i) => el.classList.toggle('cur-step', i === s)); ticks.forEach((el, i) => el.classList.toggle('on', i <= s)); tl.setAttribute('aria-valuetext', `第${NUM[s]}步 ${names[s]}`); } };

  // ---------------- gallery + lightbox
  const WORKS = [['寒江独钓 远山有雪', 'xieyi'], ['松下问童子 云深', 'gongbi'], ['泼墨山 雨', 'pomo'], ['青绿山水 日出 江', 'qinglv'], ['月出惊山鸟 鹤', 'xieyi'], ['竹林夜雨', 'pomo'], ['春江 梅花 舟', 'gongbi'], ['千里江山 云', 'qinglv']];
  const gal = $('#gal'), gbar = $('.gal-bar i');
  const workEls = WORKS.map(([p, s], i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'work'; b.setAttribute('aria-label', `查看作品：${p}（${STYLES[s].name}）`);
    const cv = document.createElement('canvas'); cv.width = 480; cv.height = 320; b.appendChild(cv);
    const cap = document.createElement('span'); cap.className = 'wc'; cap.innerHTML = `<span>${p.split(' ')[0]}</span><em>${STYLES[s].name} · 示例</em>`; b.appendChild(cap); gal.appendChild(b);
    b.addEventListener('click', e => { if (gd.moved > 6) { e.preventDefault(); return; } openLB(i, b); }); return { b, cv, p, s, done: false }; });
  const queue = []; let galQueued = false; const queueGallery = () => { if (galQueued) return; galQueued = true; workEls.forEach(w => queue.push(() => { compose(w.cv, paintLayers(480, 320, w.p, w.s, 11), 1); w.done = true; })); };
  const gd = { down: false, x: 0, sl: 0, v: 0, moved: 0, tgt: null, lt: 0 };
  gal.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; gd.down = true; gd.x = e.clientX; gd.sl = gal.scrollLeft; gd.moved = 0; gd.v = 0; gd.tgt = null; gd.lt = now; gal.classList.add('drag'); });
  addEventListener('pointermove', e => { if (!gd.down) return; const dx = e.clientX - gd.x; gd.moved = Math.max(gd.moved, Math.abs(dx)); const prev = gal.scrollLeft; gal.scrollLeft = gd.sl - dx; gd.v = (gal.scrollLeft - prev); }, { passive: true });
  addEventListener('pointerup', () => { if (!gd.down) return; gd.down = false; gal.classList.remove('drag'); gd.vel = gd.v * 60; });
  const step = () => (workEls[0].b.offsetWidth + 24);
  const nudge = d => { gd.tgt = clamp(gal.scrollLeft + d * step() * 2, 0, gal.scrollWidth - gal.clientWidth); gd.vel = 0; };
  $('.gal-p').addEventListener('click', () => nudge(-1)); $('.gal-n').addEventListener('click', () => nudge(1));
  gal.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); nudge(.5); } if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-.5); } });
  function tickGallery(dt) {
    if (!gd.down && gd.vel) { gal.scrollLeft += gd.vel * dt; gd.vel *= Math.exp(-dt * 4); if (Math.abs(gd.vel) < 5) gd.vel = 0; }
    if (gd.tgt != null) { const d = gd.tgt - gal.scrollLeft; gal.scrollLeft += d * (1 - Math.exp(-dt * 9)); if (Math.abs(d) < .5) gd.tgt = null; }
    const max = gal.scrollWidth - gal.clientWidth; const f = max > 0 ? gal.scrollLeft / max : 0; gbar.style.setProperty('--gx', (f * 233).toFixed(1) + '%');
  }
  const lb = $('#lb'), lbCv = $('#lbCv'), lbCap = $('#lbCap'); let lbFrom = null;
  function openLB(i, from) { lbFrom = from; const [p, s] = WORKS[i]; const layers = paintLayers(lbCv.width, lbCv.height, p, s, 11); lbCap.textContent = `${p} · ${STYLES[s].name}（程序化生成示例）`;
    lb.hidden = false; requestAnimationFrame(() => lb.classList.add('open')); api.lock(true); animate(1.4, k => compose(lbCv, layers, ease(k))); $('.lb-x', lb).focus(); }
  function closeLB() { if (lb.hidden) return; lb.classList.remove('open'); setTimeout(() => { lb.hidden = true; }, CAPTURE ? 0 : 400); api.lock(false); lbFrom && lbFrom.focus(); }
  $('.lb-x', lb).addEventListener('click', closeLB); lb.addEventListener('click', e => { if (e.target === lb) closeLB(); });
  lb.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); $('.lb-x', lb).focus(); } });

  // ---------------- testimonials
  const qs = $$('.q'), dots = $('.q-dots'); let qi = 0, qT = 0, qHold = false;
  const qDots = qs.map((q, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-label', `第 ${i + 1} 条`); b.addEventListener('click', () => goQ(i)); dots.appendChild(b); return b; });
  function goQ(i) { const n = (i + qs.length) % qs.length; qs.forEach((q, j) => { q.classList.toggle('out', j === qi && j !== n); q.classList.toggle('on', j === n); q.setAttribute('aria-hidden', j !== n); }); qi = n; qT = 0;
    qDots.forEach((d, j) => d.setAttribute('aria-selected', j === n)); }
  $('.q-p').addEventListener('click', () => goQ(qi - 1)); $('.q-n').addEventListener('click', () => goQ(qi + 1)); goQ(0);
  const qw = $('.quotes'); qw.addEventListener('pointerenter', () => qHold = true); qw.addEventListener('pointerleave', () => qHold = false); qw.addEventListener('focusin', () => qHold = true); qw.addEventListener('focusout', () => qHold = false);

  // ---------------- pricing toggle
  const bill = $('.bill'), bb = $$('button', bill), bi = $('i', bill);
  const moveBill = b => { bi.style.setProperty('--x', (b.offsetLeft - 4) + 'px'); bi.style.setProperty('--w', b.offsetWidth + 'px'); };
  const prices = $$('.plan .price b');
  bb.forEach(b => b.addEventListener('click', () => { bb.forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); moveBill(b);
    const y = b.dataset.b === 'y'; prices.forEach(p => { const from = +p.textContent, to = +(y ? p.dataset.y : p.dataset.m); animate(.6, k => p.textContent = Math.round(from + (to - from) * ease(k))); }); amb().tick(); }));
  const mb = M.measure; M.measure = () => { mb(); moveBill(bb.find(b => b.classList.contains('on'))); };

  // ---------------- FAQ accordion
  $$('.acc h4 button').forEach(b => b.addEventListener('click', () => { const p = $('#' + b.getAttribute('aria-controls')); const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open);
    if (open) { p.hidden = false; const h = p.scrollHeight; p.style.height = '0px'; animate(.45, k => p.style.height = (h * ease(k)) + 'px', () => p.style.height = ''); }
    else { const h = p.scrollHeight; animate(.35, k => p.style.height = (h * (1 - ease(k))) + 'px', () => { p.hidden = true; p.style.height = ''; }); } }));

  // ---------------- waitlist form (front-end only)
  const wl = $('#wl'), em = $('#em'), wbtn = $('button[type=submit]', wl), msg = $('#em-msg');
  const RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const vState = (show) => { const v = em.value.trim(); wbtn.disabled = !v || wl.classList.contains('done');
    if (!v) { em.removeAttribute('aria-invalid'); msg.textContent = ''; msg.className = 'msg'; return false; }
    if (!RX.test(v)) { if (show) { em.setAttribute('aria-invalid', 'true'); msg.textContent = '邮箱格式似乎不对，例如 name@example.com'; msg.className = 'msg err'; } return false; }
    em.removeAttribute('aria-invalid'); msg.textContent = ''; msg.className = 'msg'; return true; };
  em.addEventListener('input', () => vState(em.getAttribute('aria-invalid') === 'true')); em.addEventListener('blur', () => vState(true));
  wl.addEventListener('submit', e => { e.preventDefault(); if (!vState(true)) { em.focus(); return; }
    wbtn.classList.add('busy'); wbtn.disabled = true; msg.textContent = '提交中…'; msg.className = 'msg';
    setTimeout(() => { wbtn.classList.remove('busy'); wl.classList.add('done'); $('.bt', wbtn).textContent = '已申请 ✓'; msg.textContent = '已加入候补名单。（演示：没有发送任何数据）'; msg.className = 'msg ok'; }, CAPTURE ? 0 : 1100); });
  vState(false);

  // ---------------- reveal hooks + lazy work
  const lazy = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; const t = e.target; lazy.unobserve(t);
    if (t === pcv) paint(true); if (t === ba) paintBA(); if (t === gal) queueGallery(); }), { rootMargin: '300px 0px' });
  [pcv, ba, gal].forEach(el => lazy.observe(el));
  M.onReveal = el => { if (el.matches('.stats')) countUp(el); };
  M.finalize = () => { // capture: everything in its final state, synchronously
    $$('.stats').forEach(countUp); paint(false); paintBA(); queueGallery(); while (queue.length) queue.shift()(); select(0); M.measure(); };
  M.tick = (t, dt, cap) => { now = cap ? t : performance.now() / 1000; // UI tweens run on wall-clock (scene time is clamped on slow frames)
    for (const a of anims) { const k = a.dur ? clamp((now - a.t0) / a.dur) : 1; a.fn(k); if (k >= 1) { anims.delete(a); a.done && a.done(); } }
    if (queue.length) queue.shift()(); // one gallery thumbnail per frame
    tickBirds(t); tickGallery(dt);
    if (!cap && !REDUCED && !qHold) { qT += dt; if (qT > 6.5) goQ(qi + 1); } };
  select(0); M.measure();
  return M;
}
