// Procedural ink-painting generator (Canvas 2D). Original, deterministic from (phrase, style, seed).
// Each painting is produced as ordered layers so the UI can "paint" it in, layer by layer.
import { mulberry } from './util.js';

export const STYLES = {
  xieyi:  { name: '写意', ink: [27, 24, 20], paper: '#efe8da', blur: 2.2, wash: .9, line: 0, color: null },
  gongbi: { name: '工笔', ink: [40, 36, 30], paper: '#f2ecdf', blur: 0, wash: .35, line: 1, color: [[96, 120, 110], [170, 120, 80]] },
  pomo:   { name: '泼墨', ink: [12, 11, 10], paper: '#ebe3d3', blur: 3.5, wash: 1.25, line: 0, splash: 1, color: null },
  qinglv: { name: '青绿', ink: [30, 50, 52], paper: '#efe6d2', blur: .8, wash: .8, line: .5, color: [[40, 110, 120], [70, 140, 100], [176, 128, 72]] },
  sketch: { name: '草图', ink: [90, 86, 80], paper: '#f4f1ea', blur: 0, wash: 0, line: 1, sketch: 1, color: null },
};
const KW = { mountain: /山|峰|岭|峦/, water: /水|江|河|湖|海|溪|川|波/, moon: /月|夜|星/, sun: /日|朝|霞|晨|晓/, boat: /舟|船|钓|渔|帆/, pine: /松|柏|林/, bamboo: /竹/, crane: /鹤|鸟|雁|鹭/, snow: /雪|冬|寒|冰/, rain: /雨/, plum: /梅|花|春|桃/, cloud: /云|雾|烟|岚/ };
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function analyse(phrase) { const f = {}; for (const k in KW) f[k] = KW[k].test(phrase); return f; }

export function paintLayers(w, h, phrase, styleKey, extraSeed = 0) {
  const st = STYLES[styleKey] || STYLES.xieyi; const f = analyse(phrase || '');
  const r = mulberry(hashStr(phrase || '墨川') + extraSeed), r2 = mulberry(hashStr(phrase || '墨川') * 7 + 13 + extraSeed); // r: composition (style-independent) · r2: brush texture
  if (!Object.values(f).some(Boolean)) { f.mountain = true; f.water = r() < .7; f.moon = r() < .4; f.boat = r() < .5; f.pine = r() < .5; f.cloud = true; }
  f.mountain = true;
  const layers = []; const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); layers.push(c); return g; };
  const ink = (a) => `rgba(${st.ink[0]},${st.ink[1]},${st.ink[2]},${a})`;
  const S = Math.min(w, h) / 400;
  // 0 · paper
  { const g = mk(); g.fillStyle = st.paper; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,95,60,${r2() * .05})`; g.fillRect(r2() * w, r2() * h, 1 + r2() * 2, 1); } }
  // sun / moon
  if (f.moon || f.sun) { const g = mk(); const x = w * (.62 + r() * .22), y = h * (.18 + r() * .12), R = 26 * S;
    if (f.sun) { g.fillStyle = 'rgba(178,58,43,.85)'; } else { g.fillStyle = st.sketch ? 'rgba(0,0,0,0)' : 'rgba(255,253,246,.95)'; g.strokeStyle = ink(.35); g.lineWidth = 1.2 * S; }
    g.beginPath(); g.arc(x, y, R, 0, 7); g.fill(); if (f.moon) g.stroke();
    if (f.moon && !st.sketch) { g.globalCompositeOperation = 'destination-over'; const gr = g.createRadialGradient(x, y, R, x, y, R * 4); gr.addColorStop(0, ink(.12)); gr.addColorStop(1, ink(0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }
  // mountains: 3 depth layers
  // ridge: 2–4 sharp-ish peaks + small noise; returns screen points
  const ridge = (base, amp, li) => { const pk = []; const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) pk.push([.06 + r() * .88, .45 + r() * .55, .1 + r() * .16 + li * .03]);
    const o = r() * 50, pts = [], N = 120;
    for (let i = 0; i <= N; i++) { const x = i / N; let m = 0; for (const [c, hh, w] of pk) m = Math.max(m, hh * Math.pow(Math.max(0, 1 - Math.abs(x - c) / w), 1.35));
      const nz = Math.sin(x * 37 + o) * .025 + Math.sin(x * 83 + o * 2) * .012; pts.push([x * w, h * (base - amp * (m * .85 + .12 + nz))]); }
    return pts; };
  const depths = f.snow ? [[.62, .35, .35], [.75, .3, .6], [.86, .22, .95]] : [[.6, .36, .3], [.74, .3, .62], [.86, .24, 1]];
  depths.forEach(([base, amp, dk], li) => { const g = mk(); const pts = ridge(base, amp * (f.mountain ? 1 : .6), li);
    const top = Math.min(...pts.map(p => p[1]));
    if (st.wash > 0) { g.save(); if (st.blur) g.filter = `blur(${st.blur * S * (1.2 - li * .3)}px)`;
      const gr = g.createLinearGradient(0, top, 0, h * (base + .12));
      const colr = st.color ? st.color[li % st.color.length] : st.ink; const al = st.wash * (.25 + dk * .55) * (f.snow ? .7 : 1);
      gr.addColorStop(0, `rgba(${colr[0]},${colr[1]},${colr[2]},${al})`); gr.addColorStop(.55, `rgba(${colr[0]},${colr[1]},${colr[2]},${al * .45})`); gr.addColorStop(1, `rgba(${colr[0]},${colr[1]},${colr[2]},0)`);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); pts.forEach(p => g.lineTo(p[0], p[1])); g.lineTo(w, h); g.fill(); g.restore(); }
    // contour (dry brush / fine line)
    g.save(); g.lineCap = 'round'; g.strokeStyle = ink(st.sketch ? .55 : .5 + dk * .4); g.lineWidth = (st.line ? .9 : 1.8 + dk * 1.6) * S;
    g.beginPath(); pts.forEach((p, i) => { const jit = st.sketch ? (r2() - .5) * 1.2 : 0; i ? g.lineTo(p[0], p[1] + jit) : g.moveTo(p[0], p[1]); }); g.stroke();
    // 皴 texture: hemp-fibre strokes that start on the ridge and run down-slope, only where the slope is real
    const nC = st.sketch ? 34 : 46 + dk * 50; g.lineWidth = (st.line ? .6 : .9) * S;
    for (let i = 0, tries = 0; i < nC && tries < nC * 4; tries++) { const k = 2 + Math.floor(r2() * (pts.length - 4)); const [x, y] = pts[k];
      const sl = (pts[k + 2][1] - pts[k - 2][1]) / (pts[k + 2][0] - pts[k - 2][0]); if (Math.abs(sl) < .18) continue; i++;
      const dir = sl > 0 ? -1 : 1; const len = (10 + r2() * 30) * S * (.8 + dk * .5); const off = r2() * len * .5;
      const x0 = x + dir * off * .3, y0 = y + off * Math.abs(sl) * .3 + 2 * S;
      g.strokeStyle = ink((st.sketch ? .3 : .16) + r2() * .22 * (.5 + dk)); g.beginPath(); g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + dir * len * .25, y0 + len * .55, x0 + dir * len * (.2 + r2() * .25), y0 + len); g.stroke();
      if (!st.sketch && r2() < .35) { g.fillStyle = ink(.5 + r2() * .3); g.beginPath(); g.ellipse(x + (r2() - .5) * 6 * S, y + 1.5 * S, 1.6 * S, 1 * S, 0, 0, 7); g.fill(); } } // 点苔 moss dots on the crest
    if (f.snow && !st.sketch) { g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 40; i++) { const k = Math.floor(r() * pts.length); g.fillStyle = `rgba(0,0,0,${.4 + r() * .4})`; g.beginPath(); g.ellipse(pts[k][0], pts[k][1] + 6 * S, 10 * S * r() + 4, 3 * S, 0, 0, 7); g.fill(); } }
    if (st.splash && li === 2) { for (let i = 0; i < 18; i++) { g.fillStyle = ink(.5 + r2() * .4); g.beginPath(); g.arc(r2() * w, h * (base - r2() * .2), (2 + r2() * 14) * S, 0, 7); g.fill(); } }
    g.restore();
    if (f.cloud && li < 2) { const m = mk(); m.save(); m.filter = `blur(${8 * S}px)`; m.fillStyle = st.paper; for (let i = 0; i < 6; i++) { m.globalAlpha = .55; m.beginPath(); m.ellipse(r() * w, h * (base + .02 + r() * .06), w * (.15 + r() * .2), 10 * S, 0, 0, 7); m.fill(); } m.restore(); }
  });
  // pines / bamboo on the near ridge
  if (f.pine || f.bamboo || f.plum) { const g = mk(); g.lineCap = 'round';
    for (let k = 0; k < (f.bamboo ? 7 : 3); k++) { const x = w * (.08 + r() * .3), y = h * (.86 + r() * .05), H = h * (.25 + r() * .2);
      if (f.bamboo) { g.strokeStyle = st.color ? 'rgba(60,100,80,.85)' : ink(.75); g.lineWidth = 4 * S; for (let s = 0; s < 6; s++) { g.beginPath(); g.moveTo(x, y - H * s / 6 - 2); g.lineTo(x + s * .8, y - H * (s + 1) / 6 + 2); g.stroke(); }
        for (let l = 0; l < 6; l++) { const ly = y - H * (.5 + r() * .5); g.fillStyle = ink(.7); g.beginPath(); g.ellipse(x + (r() - .3) * 30 * S, ly, 16 * S, 3 * S, (r() - .5) * 1.2, 0, 7); g.fill(); } }
      else { g.strokeStyle = ink(.85); g.lineWidth = 3.4 * S; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 8 * S, y - H * .4, x - 10 * S, y - H * .7, x + 4 * S, y - H); g.stroke();
        for (let l = 0; l < 5; l++) { const ly = y - H * (.45 + l * .12), lx = x + (r() - .5) * 10 * S; g.fillStyle = f.plum ? 'rgba(178,58,43,.8)' : (st.color ? 'rgba(60,100,80,.8)' : ink(.75));
          if (f.plum) { for (let d = 0; d < 6; d++) { g.beginPath(); g.arc(lx + (r() - .5) * 40 * S, ly + (r() - .5) * 14 * S, 2.6 * S, 0, 7); g.fill(); } }
          else { g.beginPath(); g.ellipse(lx + (l % 2 ? 14 : -14) * S, ly, 22 * S * (1 - l * .1), 5 * S, (r() - .5) * .3, 0, 7); g.fill(); } } } } }
  // water + boat
  if (f.water || f.boat) { const g = mk(); g.lineCap = 'round'; for (let i = 0; i < 26; i++) { const y = h * (.88 + r() * .1), x = r() * w, L = (20 + r() * 70) * S; g.strokeStyle = ink(.12 + r() * .2); g.lineWidth = .9 * S; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + L / 2, y - 2 * S, x + L, y); g.stroke(); }
    if (f.boat) { const x = w * (.45 + r() * .2), y = h * .9; g.fillStyle = ink(.9); g.beginPath(); g.moveTo(x - 26 * S, y - 3 * S); g.quadraticCurveTo(x, y + 6 * S, x + 26 * S, y - 5 * S); g.quadraticCurveTo(x, y + 1 * S, x - 26 * S, y - 3 * S); g.fill();
      g.beginPath(); g.moveTo(x + 2 * S, y - 3 * S); g.lineTo(x + 8 * S, y - 3 * S); g.lineTo(x + 5 * S, y - 13 * S); g.fill(); g.beginPath(); g.moveTo(x - 3 * S, y - 12 * S); g.lineTo(x + 13 * S, y - 12 * S); g.lineTo(x + 5 * S, y - 17 * S); g.fill();
      g.strokeStyle = ink(.7); g.lineWidth = .8 * S; g.beginPath(); g.moveTo(x + 8 * S, y - 9 * S); g.lineTo(x + 40 * S, y - 30 * S); g.stroke(); } }
  // cranes
  if (f.crane) { const g = mk(); g.strokeStyle = ink(.85); g.lineCap = 'round'; for (let i = 0; i < 5; i++) { const x = w * (.3 + r() * .5), y = h * (.15 + r() * .2), s = (6 + r() * 6) * S; g.lineWidth = 1.6 * S;
    g.beginPath(); g.moveTo(x - s * 1.6, y - s * .6); g.quadraticCurveTo(x - s * .6, y - s * .2, x, y); g.quadraticCurveTo(x + s * .6, y - s * .2, x + s * 1.6, y - s * .7); g.stroke(); } }
  // snow / rain
  if (f.snow || f.rain) { const g = mk(); for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h; if (f.rain) { g.strokeStyle = ink(.15); g.lineWidth = .7 * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4 * S, y + 12 * S); g.stroke(); } else { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(x, y, (.6 + r() * 1.4) * S, 0, 7); g.fill(); } } }
  // inscription + seal (题款)
  { const g = mk(); const txt = (phrase || '墨川').slice(0, 12); const fs = Math.max(11, 14 * S); g.fillStyle = ink(.85); g.font = `${fs}px "Kaiti SC","STKaiti","KaiTi","Noto Serif CJK SC",serif`; g.textAlign = 'center';
    const x = w - 22 * S, y0 = 26 * S; [...txt].forEach((c, i) => g.fillText(c, x, y0 + i * fs * 1.15));
    const sy = y0 + txt.length * fs * 1.15 + 6 * S; if (!st.sketch) { g.fillStyle = 'rgba(178,58,43,.92)'; g.fillRect(x - 9 * S, sy, 18 * S, 18 * S); g.fillStyle = st.paper; g.font = `${9 * S}px serif`; g.fillText('墨', x, sy + 8.5 * S); g.fillText('川', x, sy + 16.5 * S); } }
  return layers;
}
// composite layers into dst with reveal progress (each layer fades in on its own slice of the timeline)
export function compose(dst, layers, prog) {
  const g = dst.getContext('2d'); const n = layers.length; g.globalAlpha = 1; g.drawImage(layers[0], 0, 0);
  for (let i = 1; i < n; i++) { const a = Math.min(1, Math.max(0, prog * n - (i - .4))); if (a <= 0) break; g.globalAlpha = a * a * (3 - 2 * a); g.drawImage(layers[i], 0, 0); }
  g.globalAlpha = 1;
}
