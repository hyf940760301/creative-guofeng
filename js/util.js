// small shared helpers (no allocations in hot paths)
import * as THREE from 'three';
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const easeOut3 = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// merge non-indexed BufferGeometries that share the same attribute names
export function merge(geos) {
  const gs = geos.map(g => g.index ? g.toNonIndexed() : g);
  const names = Object.keys(gs[0].attributes); const out = new THREE.BufferGeometry();
  for (const n of names) { const isz = gs[0].attributes[n].itemSize; let len = 0; for (const g of gs) len += g.attributes[n].array.length;
    const arr = new Float32Array(len); let o = 0; for (const g of gs) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, isz)); }
  return out;
}
// add a constant float attribute to a geometry
export function tag(g, name, v) { g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count; const a = new Float32Array(n).fill(v); g.setAttribute(name, new THREE.BufferAttribute(a, 1)); return g; }

// sweep a circle (optionally elliptical) along a polyline with per-point radius → tube geometry (non-indexed, with normals)
export function sweep(pts, radii, seg = 10, sy = 1, sx = 1) {
  const P = [], N = []; const n = pts.length; const T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const rings = [];
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
    const ref = Math.abs(T.dot(up)) > .95 ? new THREE.Vector3(1, 0, 0) : up;
    B.crossVectors(T, ref).normalize(); Nn.crossVectors(B, T).normalize();
    const ring = []; for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; const c = Math.cos(a) * sx, s = Math.sin(a) * sy;
      const nrm = new THREE.Vector3().addScaledVector(B, c).addScaledVector(Nn, s).normalize();
      ring.push([pts[i].clone().addScaledVector(B, c * radii[i]).addScaledVector(Nn, s * radii[i]), nrm]); }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) {
    const a = rings[i][k], b = rings[i][k + 1], c = rings[i + 1][k + 1], d = rings[i + 1][k];
    for (const v of [a, b, c, a, c, d]) { P.push(v[0].x, v[0].y, v[0].z); N.push(v[1].x, v[1].y, v[1].z); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g;
}

// one-shot procedural bake into a texture (render a fullscreen quad with a ShaderMaterial)
let _bake = null;
export function initBake(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.Camera(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
  _bake = (material, w, h, { mip = true, type = THREE.UnsignedByteType, wrap = false, keep = false } = {}) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, type, generateMipmaps: mip, minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter });
    if (wrap) { rt.texture.wrapS = rt.texture.wrapT = THREE.RepeatWrapping; }
    quad.material = material; const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(null); renderer.setClearColor(cc, ca); if (!keep) material.dispose(); return rt.texture;
  };
}
export const bake = (...a) => _bake(...a);
// vertex shader for bakes: full-screen quad with world-ish coords for procedural content
export const BAKE_VERT = /* glsl */`uniform vec3 uOrigin;uniform vec2 uSize;uniform float uDist;varying vec2 vUv;varying float vDist;varying vec3 vW;
void main(){vUv=uv;vW=uOrigin+vec3(uv.x*uSize.x,uv.y*uSize.y,0.);vDist=uDist;gl_Position=vec4(uv*2.-1.,0.,1.);}`;
