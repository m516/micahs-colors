import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Upload, Play, Loader2, Copy, Check, ImageIcon, Sparkles, Eye, EyeOff, Info } from "lucide-react";

// ============================================================================
// COLOR PALETTE EXTRACTION ALGORITHMS
// All take (pixels: Uint8ClampedArray RGBA, k: number, opts?) -> [[r,g,b], ...]
// ============================================================================

// ----- 1. POPULARITY (Heckbert 1982) --------------------------------------
function popularityPalette(pixels, k, opts = {}) {
  const sigBits = opts.sigBits ?? 5;
  const shift = 8 - sigBits;
  const dim = 1 << sigBits;
  const count = new Uint32Array(dim * dim * dim);
  const sumR = new Float64Array(count.length);
  const sumG = new Float64Array(count.length);
  const sumB = new Float64Array(count.length);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const idx = ((r >> shift) * dim + (g >> shift)) * dim + (b >> shift);
    count[idx]++; sumR[idx] += r; sumG[idx] += g; sumB[idx] += b;
  }
  const cands = [];
  for (let idx = 0; idx < count.length; idx++) {
    if (!count[idx]) continue;
    const c = count[idx];
    cands.push([sumR[idx] / c, sumG[idx] / c, sumB[idx] / c, c]);
  }
  cands.sort((a, b) => b[3] - a[3]);
  return cands.slice(0, k).map(c => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
}

// ----- 2. MEDIAN CUT (Heckbert 1982) --------------------------------------
function medianCutPalette(pixels, k) {
  const sigBits = 5, shift = 8 - sigBits, dim = 1 << sigBits;
  const histo = new Uint32Array(dim * dim * dim);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    histo[((pixels[i] >> shift) * dim + (pixels[i + 1] >> shift)) * dim + (pixels[i + 2] >> shift)]++;
  }
  function makeVbox(r0, r1, g0, g1, b0, b1) {
    let nr0 = dim, nr1 = -1, ng0 = dim, ng1 = -1, nb0 = dim, nb1 = -1, cnt = 0;
    for (let r = r0; r <= r1; r++)
      for (let g = g0; g <= g1; g++)
        for (let b = b0; b <= b1; b++) {
          const c = histo[(r * dim + g) * dim + b];
          if (!c) continue;
          cnt += c;
          if (r < nr0) nr0 = r; if (r > nr1) nr1 = r;
          if (g < ng0) ng0 = g; if (g > ng1) ng1 = g;
          if (b < nb0) nb0 = b; if (b > nb1) nb1 = b;
        }
    return cnt ? { r0: nr0, r1: nr1, g0: ng0, g1: ng1, b0: nb0, b1: nb1, count: cnt } : null;
  }
  function split(vb) {
    if (vb.count <= 1) return [vb, null];
    const rW = vb.r1 - vb.r0, gW = vb.g1 - vb.g0, bW = vb.b1 - vb.b0;
    const axis = (rW >= gW && rW >= bW) ? 0 : (gW >= bW ? 1 : 2);
    const lo = [vb.r0, vb.g0, vb.b0][axis], hi = [vb.r1, vb.g1, vb.b1][axis];
    const partial = new Uint32Array(dim);
    for (let i = lo; i <= hi; i++) {
      let s = 0;
      for (let a = vb.r0; a <= vb.r1; a++)
        for (let c = vb.g0; c <= vb.g1; c++)
          for (let d = vb.b0; d <= vb.b1; d++) {
            const ix = axis === 0 ? i : a, jx = axis === 1 ? i : c, kx = axis === 2 ? i : d;
            if ((axis === 0 && a !== i) || (axis === 1 && c !== i) || (axis === 2 && d !== i)) continue;
            s += histo[(ix * dim + jx) * dim + kx];
          }
      partial[i] = (i > lo ? partial[i - 1] : 0) + s;
    }
    let cut = lo;
    for (let i = lo; i < hi; i++) if (partial[i] >= vb.count / 2) { cut = i; break; }
    const ranges = [
      [vb.r0, vb.r1, vb.g0, vb.g1, vb.b0, vb.b1],
      [vb.r0, vb.r1, vb.g0, vb.g1, vb.b0, vb.b1],
    ];
    ranges[0][axis * 2 + 1] = cut;
    ranges[1][axis * 2] = cut + 1;
    return [makeVbox(...ranges[0]), makeVbox(...ranges[1])];
  }
  let queue = [makeVbox(0, dim - 1, 0, dim - 1, 0, dim - 1)].filter(Boolean);
  while (queue.length < k) {
    // Sort splittable boxes ahead of unsplittable ones, then by count.
    queue.sort((a, b) => (a.unsplittable === b.unsplittable) ? b.count - a.count : (a.unsplittable ? 1 : -1));
    const big = queue.shift();
    if (!big || big.count <= 1 || big.unsplittable) { if (big) queue.push(big); break; }
    const [a, b] = split(big);
    // If split returns [sameBox, null], the box is unsplittable (its mass is
    // concentrated in a single histogram bin). Mark it and stop trying.
    // This guards against an infinite loop on images with a tight cluster of
    // identical-colored pixels (e.g. a saturated sun highlight on a gradient).
    if (a && !b && a.count === big.count) {
      big.unsplittable = true;
      queue.push(big);
      continue;
    }
    if (a) queue.push(a);
    if (b) queue.push(b);
  }
  return queue.map(vb => {
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let r = vb.r0; r <= vb.r1; r++)
      for (let g = vb.g0; g <= vb.g1; g++)
        for (let b = vb.b0; b <= vb.b1; b++) {
          const c = histo[(r * dim + g) * dim + b];
          if (!c) continue;
          n += c;
          rs += c * ((r << shift) + (1 << (shift - 1)));
          gs += c * ((g << shift) + (1 << (shift - 1)));
          bs += c * ((b << shift) + (1 << (shift - 1)));
        }
    return n ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] : [0, 0, 0];
  });
}

// ----- 3. MMCQ (Bloomberg 2008 / Color Thief) -----------------------------
function mmcqPalette(pixels, k) {
  const SIG = 5, RSH = 3, DIM = 1 << SIG, FRACT = 0.75, MAX_ITER = 1000;
  const gi = (r, g, b) => (r << (2 * SIG)) | (g << SIG) | b;
  const histo = new Uint32Array(DIM * DIM * DIM);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r > 250 && g > 250 && b > 250) continue;
    histo[gi(r >> RSH, g >> RSH, b >> RSH)]++;
  }
  class VBox {
    constructor(r1, r2, g1, g2, b1, b2) {
      this.r1 = r1; this.r2 = r2; this.g1 = g1; this.g2 = g2; this.b1 = b1; this.b2 = b2;
      this._c = null; this._a = null;
    }
    volume() { return (this.r2 - this.r1 + 1) * (this.g2 - this.g1 + 1) * (this.b2 - this.b1 + 1); }
    count(reset) {
      if (this._c !== null && !reset) return this._c;
      let n = 0;
      for (let r = this.r1; r <= this.r2; r++)
        for (let g = this.g1; g <= this.g2; g++)
          for (let b = this.b1; b <= this.b2; b++) n += histo[gi(r, g, b)];
      return (this._c = n);
    }
    avg() {
      if (this._a) return this._a;
      const m = 1 << RSH;
      let n = 0, rs = 0, gs = 0, bs = 0;
      for (let r = this.r1; r <= this.r2; r++)
        for (let g = this.g1; g <= this.g2; g++)
          for (let b = this.b1; b <= this.b2; b++) {
            const c = histo[gi(r, g, b)];
            if (!c) continue;
            n += c;
            rs += c * (r * m + m / 2); gs += c * (g * m + m / 2); bs += c * (b * m + m / 2);
          }
      return (this._a = n
        ? [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)]
        : [Math.round(m * (this.r1 + this.r2 + 1) / 2),
           Math.round(m * (this.g1 + this.g2 + 1) / 2),
           Math.round(m * (this.b1 + this.b2 + 1) / 2)]);
    }
    copy() {
      const v = new VBox(this.r1, this.r2, this.g1, this.g2, this.b1, this.b2);
      v._c = this._c; v._a = this._a; return v;
    }
  }
  function applyCut(v) {
    if (!v.count()) return [null, null];
    if (v.count() === 1) return [v.copy(), null];
    const rw = v.r2 - v.r1 + 1, gw = v.g2 - v.g1 + 1, bw = v.b2 - v.b1 + 1;
    const m = Math.max(rw, gw, bw);
    const axis = m === rw ? "r" : m === gw ? "g" : "b";
    const partial = new Uint32Array(DIM);
    let total = 0;
    if (axis === "r") for (let r = v.r1; r <= v.r2; r++) {
      let s = 0;
      for (let g = v.g1; g <= v.g2; g++) for (let b = v.b1; b <= v.b2; b++) s += histo[gi(r, g, b)];
      total += s; partial[r] = total;
    } else if (axis === "g") for (let g = v.g1; g <= v.g2; g++) {
      let s = 0;
      for (let r = v.r1; r <= v.r2; r++) for (let b = v.b1; b <= v.b2; b++) s += histo[gi(r, g, b)];
      total += s; partial[g] = total;
    } else for (let b = v.b1; b <= v.b2; b++) {
      let s = 0;
      for (let r = v.r1; r <= v.r2; r++) for (let g = v.g1; g <= v.g2; g++) s += histo[gi(r, g, b)];
      total += s; partial[b] = total;
    }
    const lo = v[axis + "1"], hi = v[axis + "2"];
    for (let i = lo; i <= hi; i++) {
      if (partial[i] > total / 2) {
        const v1 = v.copy(), v2 = v.copy();
        const left = i - lo, right = hi - i;
        const cut = left <= right
          ? Math.min(hi - 1, Math.round(i + right / 2))
          : Math.max(lo, Math.round(i - 1 - left / 2));
        v1[axis + "2"] = cut; v2[axis + "1"] = cut + 1;
        v1.count(true); v2.count(true);
        return [v1, v2];
      }
    }
    return [v.copy(), null];
  }
  class PQ {
    constructor(cmp) { this.h = []; this.cmp = cmp; }
    size() { return this.h.length; }
    push(x) { this.h.push(x); this._up(this.h.length - 1); }
    pop() {
      if (!this.h.length) return null;
      const t = this.h[0], e = this.h.pop();
      if (this.h.length) { this.h[0] = e; this._down(0); }
      return t;
    }
    _up(i) {
      while (i) {
        const p = (i - 1) >> 1;
        if (this.cmp(this.h[i], this.h[p]) < 0) {
          [this.h[i], this.h[p]] = [this.h[p], this.h[i]]; i = p;
        } else break;
      }
    }
    _down(i) {
      const n = this.h.length;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let best = i;
        if (l < n && this.cmp(this.h[l], this.h[best]) < 0) best = l;
        if (r < n && this.cmp(this.h[r], this.h[best]) < 0) best = r;
        if (best === i) break;
        [this.h[i], this.h[best]] = [this.h[best], this.h[i]]; i = best;
      }
    }
    toArray() { return this.h.slice(); }
  }
  let rmin = DIM, rmax = 0, gmin = DIM, gmax = 0, bmin = DIM, bmax = 0;
  for (let r = 0; r < DIM; r++)
    for (let g = 0; g < DIM; g++)
      for (let b = 0; b < DIM; b++)
        if (histo[gi(r, g, b)]) {
          if (r < rmin) rmin = r; if (r > rmax) rmax = r;
          if (g < gmin) gmin = g; if (g > gmax) gmax = g;
          if (b < bmin) bmin = b; if (b > bmax) bmax = b;
        }
  if (rmax < rmin) return [];
  const pq1 = new PQ((a, b) => b.count() - a.count());
  pq1.push(new VBox(rmin, rmax, gmin, gmax, bmin, bmax));
  const target1 = Math.max(1, Math.ceil(FRACT * k));
  let i = 0;
  while (i < MAX_ITER && pq1.size() < target1) {
    const v = pq1.pop();
    if (!v || !v.count()) { i++; continue; }
    const [v1, v2] = applyCut(v);
    if (v1) pq1.push(v1);
    if (v2 && v2.count()) pq1.push(v2);
    i++;
  }
  const pq2 = new PQ((a, b) => b.count() * b.volume() - a.count() * a.volume());
  while (pq1.size()) pq2.push(pq1.pop());
  i = 0;
  while (i < MAX_ITER && pq2.size() < k) {
    const v = pq2.pop();
    if (!v || !v.count()) { i++; continue; }
    const [v1, v2] = applyCut(v);
    if (v1) pq2.push(v1);
    if (v2 && v2.count()) pq2.push(v2);
    i++;
  }
  return pq2.toArray().map(v => v.avg());
}

// ----- 4. OCTREE (Gervautz & Purgathofer 1988) ----------------------------
function octreePalette(pixels, k) {
  const MAX_LEVEL = 8;
  const reducible = Array.from({ length: MAX_LEVEL }, () => []);
  let leafCount = 0;
  function makeNode(level) {
    const n = { isLeaf: level === MAX_LEVEL, r: 0, g: 0, b: 0, count: 0, children: new Array(8).fill(null), level };
    if (n.isLeaf) leafCount++; else reducible[level].push(n);
    return n;
  }
  function insert(node, r, g, b, level) {
    if (node.isLeaf) { node.r += r; node.g += g; node.b += b; node.count += 1; return; }
    const idx = (((r >> (7 - level)) & 1) << 2) | (((g >> (7 - level)) & 1) << 1) | ((b >> (7 - level)) & 1);
    if (!node.children[idx]) node.children[idx] = makeNode(level + 1);
    insert(node.children[idx], r, g, b, level + 1);
  }
  function reduce() {
    let lvl = MAX_LEVEL - 1;
    while (lvl >= 0 && reducible[lvl].length === 0) lvl--;
    if (lvl < 0) return;
    let bestIdx = 0, bestCount = Infinity;
    const list = reducible[lvl];
    for (let i = 0; i < list.length; i++) {
      let t = 0;
      for (const c of list[i].children) if (c) t += c.count;
      if (t < bestCount) { bestCount = t; bestIdx = i; }
    }
    const node = list.splice(bestIdx, 1)[0];
    for (let i = 0; i < 8; i++) {
      const c = node.children[i]; if (!c) continue;
      node.r += c.r; node.g += c.g; node.b += c.b; node.count += c.count;
      node.children[i] = null;
      if (c.isLeaf) leafCount--;
      else {
        const arr = reducible[c.level], kk = arr.indexOf(c);
        if (kk >= 0) arr.splice(kk, 1);
      }
    }
    node.isLeaf = true; leafCount++;
  }
  const root = makeNode(0);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    insert(root, pixels[i], pixels[i + 1], pixels[i + 2], 0);
    while (leafCount > k) reduce();
  }
  const out = [];
  (function walk(n) {
    if (!n) return;
    if (n.isLeaf) {
      out.push([Math.round(n.r / n.count), Math.round(n.g / n.count), Math.round(n.b / n.count)]);
      return;
    }
    for (const c of n.children) walk(c);
  })(root);
  return out;
}

// ----- 5. WU (Wu 1991/1992) -----------------------------------------------
// Cleaner implementation with correct 3D prefix sums.
function wuPalette(pixels, k) {
  const N = 33, SIZE = N * N * N;
  const idx = (r, g, b) => (r * N + g) * N + b;
  const wt = new Float64Array(SIZE), mr = new Float64Array(SIZE);
  const mg = new Float64Array(SIZE), mb = new Float64Array(SIZE), m2 = new Float64Array(SIZE);
  // Histogram into bins 1..32 (0 is sentinel).
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const ir = (r >> 3) + 1, ig = (g >> 3) + 1, ib = (b >> 3) + 1;
    const ix = idx(ir, ig, ib);
    wt[ix] += 1; mr[ix] += r; mg[ix] += g; mb[ix] += b;
    m2[ix] += r * r + g * g + b * b;
  }
  // Build 3D prefix sums by three orthogonal sweeps.
  const sweep = (arr) => {
    for (let r = 1; r < N; r++)
      for (let g = 1; g < N; g++) {
        let s = 0;
        for (let b = 1; b < N; b++) { s += arr[idx(r, g, b)]; arr[idx(r, g, b)] = s; }
      }
    for (let r = 1; r < N; r++)
      for (let b = 1; b < N; b++) {
        let s = 0;
        for (let g = 1; g < N; g++) { s += arr[idx(r, g, b)]; arr[idx(r, g, b)] = s; }
      }
    for (let g = 1; g < N; g++)
      for (let b = 1; b < N; b++) {
        let s = 0;
        for (let r = 1; r < N; r++) { s += arr[idx(r, g, b)]; arr[idx(r, g, b)] = s; }
      }
  };
  sweep(wt); sweep(mr); sweep(mg); sweep(mb); sweep(m2);
  function vol(c, P) {
    return P[idx(c.r1, c.g1, c.b1)] - P[idx(c.r1, c.g1, c.b0)]
         - P[idx(c.r1, c.g0, c.b1)] + P[idx(c.r1, c.g0, c.b0)]
         - P[idx(c.r0, c.g1, c.b1)] + P[idx(c.r0, c.g1, c.b0)]
         + P[idx(c.r0, c.g0, c.b1)] - P[idx(c.r0, c.g0, c.b0)];
  }
  function bot(c, dir, P) {
    if (dir === 0) return -P[idx(c.r0, c.g1, c.b1)] + P[idx(c.r0, c.g1, c.b0)] + P[idx(c.r0, c.g0, c.b1)] - P[idx(c.r0, c.g0, c.b0)];
    if (dir === 1) return -P[idx(c.r1, c.g0, c.b1)] + P[idx(c.r1, c.g0, c.b0)] + P[idx(c.r0, c.g0, c.b1)] - P[idx(c.r0, c.g0, c.b0)];
    return -P[idx(c.r1, c.g1, c.b0)] + P[idx(c.r1, c.g0, c.b0)] + P[idx(c.r0, c.g1, c.b0)] - P[idx(c.r0, c.g0, c.b0)];
  }
  function top(c, dir, pos, P) {
    if (dir === 0) return P[idx(pos, c.g1, c.b1)] - P[idx(pos, c.g1, c.b0)] - P[idx(pos, c.g0, c.b1)] + P[idx(pos, c.g0, c.b0)];
    if (dir === 1) return P[idx(c.r1, pos, c.b1)] - P[idx(c.r1, pos, c.b0)] - P[idx(c.r0, pos, c.b1)] + P[idx(c.r0, pos, c.b0)];
    return P[idx(c.r1, c.g1, pos)] - P[idx(c.r1, c.g0, pos)] - P[idx(c.r0, c.g1, pos)] + P[idx(c.r0, c.g0, pos)];
  }
  function variance(c) {
    const dr = vol(c, mr), dg = vol(c, mg), db = vol(c, mb), w = vol(c, wt);
    if (w === 0) return 0;
    return vol(c, m2) - (dr * dr + dg * dg + db * db) / w;
  }
  function maximize(c, dir, first, last, wr, wg, wb, ww) {
    const br = bot(c, dir, mr), bg = bot(c, dir, mg), bb = bot(c, dir, mb), bw = bot(c, dir, wt);
    let max = 0, cut = -1;
    for (let i = first; i < last; i++) {
      const hr = br + top(c, dir, i, mr), hg = bg + top(c, dir, i, mg);
      const hb = bb + top(c, dir, i, mb), hw = bw + top(c, dir, i, wt);
      if (hw === 0) continue;
      let t = (hr * hr + hg * hg + hb * hb) / hw;
      const ar = wr - hr, ag = wg - hg, ab = wb - hb, aw = ww - hw;
      if (aw === 0) continue;
      t += (ar * ar + ag * ag + ab * ab) / aw;
      if (t > max) { max = t; cut = i; }
    }
    return { value: max, pos: cut };
  }
  function cut(s1, s2) {
    const wr = vol(s1, mr), wg = vol(s1, mg), wb = vol(s1, mb), ww = vol(s1, wt);
    const cr = maximize(s1, 0, s1.r0 + 1, s1.r1, wr, wg, wb, ww);
    const cg = maximize(s1, 1, s1.g0 + 1, s1.g1, wr, wg, wb, ww);
    const cb = maximize(s1, 2, s1.b0 + 1, s1.b1, wr, wg, wb, ww);
    let dir;
    if (cr.value >= cg.value && cr.value >= cb.value) { dir = 0; if (cr.pos < 0) return false; }
    else if (cg.value >= cb.value) dir = 1;
    else dir = 2;
    s2.r1 = s1.r1; s2.g1 = s1.g1; s2.b1 = s1.b1;
    if (dir === 0) { s2.r0 = s1.r1 = cr.pos; s2.g0 = s1.g0; s2.b0 = s1.b0; }
    else if (dir === 1) { s2.g0 = s1.g1 = cg.pos; s2.r0 = s1.r0; s2.b0 = s1.b0; }
    else { s2.b0 = s1.b1 = cb.pos; s2.r0 = s1.r0; s2.g0 = s1.g0; }
    return true;
  }
  const boxes = Array.from({ length: k }, () => ({ r0: 0, r1: 0, g0: 0, g1: 0, b0: 0, b1: 0 }));
  boxes[0] = { r0: 0, r1: 32, g0: 0, g1: 32, b0: 0, b1: 32 };
  const vv = new Float64Array(k);
  let next = 0;
  for (let i = 1; i < k; i++) {
    if (cut(boxes[next], boxes[i])) {
      vv[next] = variance(boxes[next]);
      vv[i] = variance(boxes[i]);
    } else { vv[next] = 0; i--; }
    next = 0;
    let m = vv[0];
    for (let j = 1; j <= i; j++) if (vv[j] > m) { m = vv[j]; next = j; }
    if (m <= 0) break;
  }
  const palette = [];
  for (let i = 0; i < k; i++) {
    const w = vol(boxes[i], wt);
    if (w > 0)
      palette.push([
        Math.round(vol(boxes[i], mr) / w),
        Math.round(vol(boxes[i], mg) / w),
        Math.round(vol(boxes[i], mb) / w),
      ]);
  }
  return palette;
}

// ----- 6. K-MEANS with k-means++ init (Lloyd / Arthur–Vassilvitskii) -----
function kmeansPalette(pixels, k, opts = {}) {
  const maxIter = opts.maxIterations ?? 12;
  const tol = opts.tolerance ?? 1.0;
  const sigBits = 5, shift = 8 - sigBits;
  let _s = (opts.seed ?? 42) >>> 0;
  const rand = () => {
    _s = (_s + 0x6D2B79F5) >>> 0;
    let t = _s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const histo = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    const key = ((pixels[i] >> shift) << (2 * sigBits)) | ((pixels[i + 1] >> shift) << sigBits) | (pixels[i + 2] >> shift);
    histo.set(key, (histo.get(key) ?? 0) + 1);
  }
  const U = histo.size;
  if (!U) return [];
  const cx = new Float64Array(U), cy = new Float64Array(U), cz = new Float64Array(U);
  const wts = new Float64Array(U);
  const half = 1 << (shift - 1);
  let u = 0;
  for (const [key, w] of histo) {
    cx[u] = (((key >> (2 * sigBits)) & ((1 << sigBits) - 1)) << shift) + half;
    cy[u] = (((key >> sigBits) & ((1 << sigBits) - 1)) << shift) + half;
    cz[u] = ((key & ((1 << sigBits) - 1)) << shift) + half;
    wts[u] = w; u++;
  }
  const kk = Math.min(k, U);
  const kx = new Float64Array(kk), ky = new Float64Array(kk), kz = new Float64Array(kk);
  let totalW = 0; for (let i = 0; i < U; i++) totalW += wts[i];
  let pick = rand() * totalW;
  for (let i = 0; i < U; i++) { pick -= wts[i]; if (pick <= 0) { kx[0] = cx[i]; ky[0] = cy[i]; kz[0] = cz[i]; break; } }
  const d2 = new Float64Array(U);
  for (let i = 0; i < U; i++) {
    const dx = cx[i] - kx[0], dy = cy[i] - ky[0], dz = cz[i] - kz[0];
    d2[i] = dx * dx + dy * dy + dz * dz;
  }
  for (let c = 1; c < kk; c++) {
    let sum = 0; for (let i = 0; i < U; i++) sum += d2[i] * wts[i];
    if (sum === 0) { kx[c] = cx[0]; ky[c] = cy[0]; kz[c] = cz[0]; continue; }
    let r = rand() * sum, chosen = 0;
    for (let i = 0; i < U; i++) { r -= d2[i] * wts[i]; if (r <= 0) { chosen = i; break; } }
    kx[c] = cx[chosen]; ky[c] = cy[chosen]; kz[c] = cz[chosen];
    for (let i = 0; i < U; i++) {
      const dx = cx[i] - kx[c], dy = cy[i] - ky[c], dz = cz[i] - kz[c];
      const nd = dx * dx + dy * dy + dz * dz;
      if (nd < d2[i]) d2[i] = nd;
    }
  }
  const sumX = new Float64Array(kk), sumY = new Float64Array(kk), sumZ = new Float64Array(kk), sumW = new Float64Array(kk);
  for (let iter = 0; iter < maxIter; iter++) {
    sumX.fill(0); sumY.fill(0); sumZ.fill(0); sumW.fill(0);
    for (let i = 0; i < U; i++) {
      let bC = 0, bD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dx = cx[i] - kx[c], dy = cy[i] - ky[c], dz = cz[i] - kz[c];
        const dd = dx * dx + dy * dy + dz * dz;
        if (dd < bD) { bD = dd; bC = c; }
      }
      const w = wts[i];
      sumX[bC] += cx[i] * w; sumY[bC] += cy[i] * w; sumZ[bC] += cz[i] * w; sumW[bC] += w;
    }
    let maxMove = 0;
    for (let c = 0; c < kk; c++) {
      if (sumW[c] === 0) continue;
      const nx = sumX[c] / sumW[c], ny = sumY[c] / sumW[c], nz = sumZ[c] / sumW[c];
      const dx = nx - kx[c], dy = ny - ky[c], dz = nz - kz[c];
      const mv = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (mv > maxMove) maxMove = mv;
      kx[c] = nx; ky[c] = ny; kz[c] = nz;
    }
    if (maxMove < tol) break;
  }
  const palette = [];
  for (let c = 0; c < kk; c++)
    palette.push([
      Math.max(0, Math.min(255, Math.round(kx[c]))),
      Math.max(0, Math.min(255, Math.round(ky[c]))),
      Math.max(0, Math.min(255, Math.round(kz[c]))),
    ]);
  return palette;
}

// ----- 7. NEUQUANT (Dekker 1994) ------------------------------------------
// Bugs fixed (verified empirically against synthetic test images):
//  (1) Winner is now ALWAYS updated, even when rad = 0. Previously, the combined
//      loop collapsed to an empty range when radius decayed, so no neuron — not
//      even the winner — moved. Catastrophic for small K where INITRADIUS<=1.
//  (2) INITRADIUS bumped so K<=8 gets at least some neighborhood-based training.
//  (3) Variables now named consistently with what they hold (R, G, B from image),
//      and output emits in (R, G, B) order. The old code had R and B swapped.
function neuQuantPalette(pixels, k, opts = {}) {
  const sampleFac = opts.sampleFac ?? 10;
  const buf = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    buf.push(pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  if (!buf.length) return [];
  const NETSIZE = k;
  const NCYCLES = 100, INITALPHA = 1 << 10, RADIUSBIAS = 1 << 6;
  // Make initial radius useful even for small K — original constant was (k>>3)*64
  // which gives rad=1 (snapped to 0) for any K<=8.
  const INITRADIUS = Math.max((NETSIZE >> 3) * RADIUSBIAS, (NETSIZE >> 2) * RADIUSBIAS);
  const ALPHABIASSHIFT = 10, RADIUSDEC = 30, NETBIASSHIFT = 4;
  const net = new Float64Array(NETSIZE * 3);
  for (let i = 0; i < NETSIZE; i++) {
    const v = (i << (NETBIASSHIFT + 8)) / NETSIZE;
    net[i * 3] = v; net[i * 3 + 1] = v; net[i * 3 + 2] = v;
  }
  const lengthcount = buf.length;
  const samplepixels = Math.max(1, Math.floor(lengthcount / (3 * sampleFac)));
  const delta = Math.max(1, Math.floor(samplepixels / NCYCLES));
  let alpha = INITALPHA, radius = INITRADIUS, rad = radius >> 6;
  if (rad <= 1) rad = 0;
  const PRIME1 = 499, PRIME2 = 491, PRIME3 = 487, PRIME4 = 503;
  const step = i => i < PRIME4 ? PRIME1 : (i % PRIME2 ? PRIME2 : (i % PRIME3 ? PRIME3 : PRIME4));
  let pix = 0, i = 0;
  while (i < samplepixels) {
    // Read pixel in honest RGB order.
    const R = buf[pix] << NETBIASSHIFT, G = buf[pix + 1] << NETBIASSHIFT, B = buf[pix + 2] << NETBIASSHIFT;
    // Find winner: nearest neuron under L1 distance.
    let best = 0, bestD = Infinity;
    for (let n = 0; n < NETSIZE; n++) {
      const ix = n * 3;
      const dR = net[ix] - R, dG = net[ix + 1] - G, dB = net[ix + 2] - B;
      const d = Math.abs(dR) + Math.abs(dG) + Math.abs(dB);
      if (d < bestD) { bestD = d; best = n; }
    }
    const aN = alpha / INITALPHA;
    // Always update the winner — even at rad=0.
    const wIx = best * 3;
    net[wIx]     -= aN * (net[wIx]     - R);
    net[wIx + 1] -= aN * (net[wIx + 1] - G);
    net[wIx + 2] -= aN * (net[wIx + 2] - B);
    // Update neighborhood if radius > 0.
    if (rad > 0) {
      const lo = Math.max(best - rad, 0);
      const hi = Math.min(best + rad, NETSIZE - 1);
      for (let n = lo; n <= hi; n++) {
        if (n === best) continue;
        const dist = n > best ? n - best : best - n;
        const a = aN * (1 - dist / rad);
        const ix = n * 3;
        net[ix]     -= a * (net[ix]     - R);
        net[ix + 1] -= a * (net[ix + 1] - G);
        net[ix + 2] -= a * (net[ix + 2] - B);
      }
    }
    pix += step(i) * 3;
    if (pix >= lengthcount) pix -= lengthcount;
    i++;
    if (i % delta === 0) {
      alpha -= alpha / (30 + ((NCYCLES - 1) << ALPHABIASSHIFT));
      radius -= radius / RADIUSDEC;
      rad = radius >> 6;
      if (rad <= 1) rad = 0;
    }
  }
  const palette = [];
  for (let n = 0; n < NETSIZE; n++) {
    const ix = n * 3;
    // Emit honest RGB (no swap).
    palette.push([
      Math.max(0, Math.min(255, Math.round(net[ix]     / (1 << NETBIASSHIFT)))),
      Math.max(0, Math.min(255, Math.round(net[ix + 1] / (1 << NETBIASSHIFT)))),
      Math.max(0, Math.min(255, Math.round(net[ix + 2] / (1 << NETBIASSHIFT)))),
    ]);
  }
  return palette;
}

// ----- 8. VIBRANT / ANDROID PALETTE (volume-priority median cut) ----------
function vibrantPalette(pixels, k) {
  const SIG = 5, SHIFT = 8 - SIG, DIM = 1 << SIG, MASK = DIM - 1;
  const histo = new Uint32Array(DIM * DIM * DIM);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 125) continue;
    const r = pixels[i] >> SHIFT, g = pixels[i + 1] >> SHIFT, b = pixels[i + 2] >> SHIFT;
    if (r === MASK && g === MASK && b === MASK) continue;
    if (r === 0 && g === 0 && b === 0) continue;
    histo[(r << (2 * SIG)) | (g << SIG) | b]++;
  }
  const distinct = [];
  for (let key = 0; key < histo.length; key++) if (histo[key]) distinct.push(key);
  if (!distinct.length) return [];
  function buildBox(lo, hi) {
    let rMin = MASK, rMax = 0, gMin = MASK, gMax = 0, bMin = MASK, bMax = 0, pop = 0;
    for (let i = lo; i <= hi; i++) {
      const key = distinct[i];
      const r = (key >> (2 * SIG)) & MASK, g = (key >> SIG) & MASK, b = key & MASK;
      pop += histo[key];
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    return { lo, hi, rMin, rMax, gMin, gMax, bMin, bMax, pop,
             volume: (rMax - rMin + 1) * (gMax - gMin + 1) * (bMax - bMin + 1) };
  }
  function splitBox(box) {
    if (box.hi <= box.lo) return null;
    const dr = box.rMax - box.rMin, dg = box.gMax - box.gMin, db = box.bMax - box.bMin;
    const axis = dr >= dg && dr >= db ? 0 : (dg >= db ? 1 : 2);
    const reorder = key => {
      const r = (key >> (2 * SIG)) & MASK, g = (key >> SIG) & MASK, b = key & MASK;
      if (axis === 0) return (r << (2 * SIG)) | (g << SIG) | b;
      if (axis === 1) return (g << (2 * SIG)) | (r << SIG) | b;
      return (b << (2 * SIG)) | (g << SIG) | r;
    };
    const slice = distinct.slice(box.lo, box.hi + 1).map(k => ({ k, s: reorder(k) }))
      .sort((a, b) => a.s - b.s).map(o => o.k);
    for (let i = 0; i < slice.length; i++) distinct[box.lo + i] = slice[i];
    const half = box.pop / 2;
    let count = 0, splitAt = box.lo;
    for (let i = box.lo; i <= box.hi; i++) {
      count += histo[distinct[i]];
      if (count >= half) { splitAt = Math.min(box.hi - 1, i); break; }
    }
    return [buildBox(box.lo, splitAt), buildBox(splitAt + 1, box.hi)];
  }
  const queue = [buildBox(0, distinct.length - 1)];
  while (queue.length < k) {
    queue.sort((a, b) => b.volume - a.volume);
    const big = queue.shift();
    const split = splitBox(big);
    if (!split) { queue.push(big); break; }
    queue.push(split[0], split[1]);
  }
  return queue.map(box => {
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let i = box.lo; i <= box.hi; i++) {
      const key = distinct[i], c = histo[key];
      rs += c * (((key >> (2 * SIG)) & MASK) << SHIFT);
      gs += c * (((key >> SIG) & MASK) << SHIFT);
      bs += c * ((key & MASK) << SHIFT);
      n += c;
    }
    return [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)];
  });
}

// ============================================================================
// EXTENDED ALGORITHMS (drop-in module)
// ----------------------------------------------------------------------------
// All algorithms below match the original PaletteLab signature:
//     extractPalette(pixels: Uint8ClampedArray, k: number, opts?) -> [[r,g,b]]
// with ONE caveat: SCQ and libimagequant additionally require `opts.width` and
// `opts.height` because they operate on spatial neighborhoods, not just colors.
// The runAll() handler below passes these automatically — search for
// "needsImageDims" in the ALGORITHMS registry to see which entries opt in.
//
// These 16 functions can be lifted out into a separate algorithms.js module
// wholesale; they have no React dependencies. The block is self-contained
// between the EXTENDED ALGORITHMS START and END markers.
// ============================================================================

// ===== EXTENDED ALGORITHMS START =====

// --- Shared utilities ---
function ext_buildHistogram(pixels, alphaThresh = 8) {
  const hist = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < alphaThresh) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    let entry = hist.get(key);
    if (entry === undefined) hist.set(key, { r, g, b, count: 1, sr: r, sg: g, sb: b });
    else { entry.count++; entry.sr += r; entry.sg += g; entry.sb += b; }
  }
  const arr = [];
  for (const e of hist.values())
    arr.push({ r: e.sr / e.count, g: e.sg / e.count, b: e.sb / e.count, w: e.count });
  return arr;
}
function ext_d2(a, b) { const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b; return dr*dr + dg*dg + db*db; }
function ext_srgbToOklab(r, g, b) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lr = f(r), lg = f(g), lb = f(b);
  const l = 0.4122214708*lr + 0.5363325363*lg + 0.0514459929*lb;
  const m = 0.2119034982*lr + 0.6806995451*lg + 0.1073969566*lb;
  const s = 0.0883024619*lr + 0.2817188376*lg + 0.6299787005*lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_,
  ];
}
function ext_oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774*a + 0.2158037573*b;
  const m_ = L - 0.1055613458*a - 0.0638541728*b;
  const s_ = L - 0.0894841775*a - 1.2914855480*b;
  const l = l_*l_*l_, m = m_*m_*m_, s = s_*s_*s_;
  let lr =  4.0767416621*l - 3.3077115913*m + 0.2309699292*s;
  let lg = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s;
  let lb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s;
  const g = c => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [g(lr), g(lg), g(lb)];
}

// --- LBG (Linde-Buzo-Gray 1980) ---
function lbgPalette(pixels, k, opts = {}) {
  const eps = opts.epsilon ?? 1.0, tol = opts.tol ?? 0.005, maxIter = opts.maxIter ?? 20;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  let sw=0,sr=0,sg=0,sb=0;
  for (const p of data){sw+=p.w;sr+=p.r*p.w;sg+=p.g*p.w;sb+=p.b*p.w;}
  let C = [{ r: sr/sw, g: sg/sw, b: sb/sw }];
  function runLloyd() {
    let prevD = Infinity;
    for (let it = 0; it < maxIter; it++) {
      const acc = C.map(()=>({sr:0,sg:0,sb:0,sw:0}));
      let D = 0;
      for (const p of data) {
        let best=0,bd=Infinity;
        for (let j=0;j<C.length;j++){const dd=ext_d2(p,C[j]); if(dd<bd){bd=dd;best=j;}}
        D += bd*p.w;
        const a = acc[best];
        a.sr+=p.r*p.w; a.sg+=p.g*p.w; a.sb+=p.b*p.w; a.sw+=p.w;
      }
      for (let j=0;j<C.length;j++) if(acc[j].sw>0)
        C[j]={r:acc[j].sr/acc[j].sw,g:acc[j].sg/acc[j].sw,b:acc[j].sb/acc[j].sw};
      if (prevD - D < tol*prevD) break;
      prevD = D;
    }
  }
  while (C.length < k) {
    const next=[];
    for (const c of C){next.push({r:c.r+eps,g:c.g+eps,b:c.b+eps}); next.push({r:c.r-eps,g:c.g-eps,b:c.b-eps});}
    C = next; runLloyd();
    if (C.length >= k) C = C.slice(0,k);
  }
  return C.map(c => [Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
}

// --- WWP (Wan-Wong-Prusinkiewicz variance-based 1990) ---
function wwpPalette(pixels, k) {
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  function boxStats(slice) {
    let sw=0,sr=0,sg=0,sb=0;
    for (const p of slice){sw+=p.w;sr+=p.r*p.w;sg+=p.g*p.w;sb+=p.b*p.w;}
    const mr=sr/sw,mg=sg/sw,mb=sb/sw;
    let sse=0;
    for (const p of slice){const dr=p.r-mr,dg=p.g-mg,db=p.b-mb; sse+=p.w*(dr*dr+dg*dg+db*db);}
    return {mr,mg,mb,sse,sw};
  }
  function bestSplit(slice) {
    let bestRes=Infinity,bestAxis=0,bestT=0;
    for (let axis=0; axis<3; axis++){
      const key = axis===0?'r':axis===1?'g':'b';
      slice.sort((a,b)=>a[key]-b[key]);
      let sw=0,sr=0,sg=0,sb=0,s2=0;
      const stats = slice.map(p=>{sw+=p.w;sr+=p.r*p.w;sg+=p.g*p.w;sb+=p.b*p.w;s2+=p.w*(p.r*p.r+p.g*p.g+p.b*p.b);return {sw,sr,sg,sb,s2};});
      const total=stats[stats.length-1];
      for (let i=0;i<stats.length-1;i++){
        const L=stats[i]; const Rw=total.sw-L.sw;
        if (L.sw===0||Rw===0) continue;
        const Lsse = L.s2 - (L.sr*L.sr+L.sg*L.sg+L.sb*L.sb)/L.sw;
        const Rsr=total.sr-L.sr,Rsg=total.sg-L.sg,Rsb=total.sb-L.sb,Rs2=total.s2-L.s2;
        const Rsse = Rs2 - (Rsr*Rsr+Rsg*Rsg+Rsb*Rsb)/Rw;
        if (Lsse+Rsse < bestRes){bestRes=Lsse+Rsse; bestAxis=axis; bestT=i;}
      }
    }
    return {axis:bestAxis, splitIdx:bestT};
  }
  let boxes = [{slice:data, ...boxStats(data)}];
  while (boxes.length < k) {
    let bi=0;
    for (let i=1;i<boxes.length;i++) if (boxes[i].sse>boxes[bi].sse) bi=i;
    const box = boxes[bi];
    if (box.slice.length<2 || box.sse<1e-6) break;
    const {axis,splitIdx}=bestSplit(box.slice);
    const key = axis===0?'r':axis===1?'g':'b';
    box.slice.sort((a,b)=>a[key]-b[key]);
    const left=box.slice.slice(0,splitIdx+1), right=box.slice.slice(splitIdx+1);
    boxes.splice(bi,1, {slice:left,...boxStats(left)}, {slice:right,...boxStats(right)});
  }
  return boxes.map(b => [Math.round(b.mr), Math.round(b.mg), Math.round(b.mb)]);
}

// --- Orchard-Bouman PCA splitting (1991) ---
function orchardBoumanPalette(pixels, k) {
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  function analyze(slice) {
    let sw=0,sr=0,sg=0,sb=0;
    for (const p of slice){sw+=p.w;sr+=p.r*p.w;sg+=p.g*p.w;sb+=p.b*p.w;}
    const mr=sr/sw,mg=sg/sw,mb=sb/sw;
    let rr=0,rg=0,rb=0,gg=0,gb=0,bb=0;
    for (const p of slice){const dr=p.r-mr,dg=p.g-mg,db=p.b-mb,w=p.w;rr+=w*dr*dr;rg+=w*dr*dg;rb+=w*dr*db;gg+=w*dg*dg;gb+=w*dg*db;bb+=w*db*db;}
    let vx=1,vy=1,vz=1,lambda=0;
    for (let it=0;it<24;it++){
      const nx=rr*vx+rg*vy+rb*vz, ny=rg*vx+gg*vy+gb*vz, nz=rb*vx+gb*vy+bb*vz;
      const n=Math.hypot(nx,ny,nz)||1;
      vx=nx/n;vy=ny/n;vz=nz/n; lambda=n;
    }
    return {mr,mg,mb,sw,ex:vx,ey:vy,ez:vz,lambda};
  }
  let boxes=[{slice:data, ...analyze(data)}];
  while (boxes.length < k){
    let bi=0,bv=-1;
    for (let i=0;i<boxes.length;i++){
      const v=boxes[i].lambda*boxes[i].sw;
      if (v>bv && boxes[i].slice.length>1){bv=v;bi=i;}
    }
    if (bv < 1e-6) break;
    const box=boxes[bi];
    const left=[],right=[];
    for (const p of box.slice){
      const proj=(p.r-box.mr)*box.ex+(p.g-box.mg)*box.ey+(p.b-box.mb)*box.ez;
      (proj<=0?left:right).push(p);
    }
    if (!left.length || !right.length){box.lambda=0; continue;}
    boxes.splice(bi,1, {slice:left,...analyze(left)}, {slice:right,...analyze(right)});
  }
  return boxes.map(b => [Math.round(b.mr),Math.round(b.mg),Math.round(b.mb)]);
}

// --- Wu PCA-DP (1992 globally-optimal along principal axis) ---
function wuPcaDpPalette(pixels, k, opts = {}) {
  // M is the resolution of the 1-D projection used by the DP. Must be > k, or
  // the table cannot represent k partitions and backtracking collapses to one
  // cluster. We use 4× k as a sensible default, capped at 384 to keep the
  // O(k * M^2) DP affordable at large K.
  const M = opts.M ?? Math.min(384, Math.max(96, k * 4));
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  let SW=0,SR=0,SG=0,SB=0;
  for (const p of data){SW+=p.w;SR+=p.r*p.w;SG+=p.g*p.w;SB+=p.b*p.w;}
  const mr=SR/SW,mg=SG/SW,mb=SB/SW;
  let rr=0,rg=0,rb=0,gg=0,gb=0,bb=0;
  for (const p of data){const dr=p.r-mr,dg=p.g-mg,db=p.b-mb,w=p.w;rr+=w*dr*dr;rg+=w*dr*dg;rb+=w*dr*db;gg+=w*dg*dg;gb+=w*dg*db;bb+=w*db*db;}
  let ex=1,ey=1,ez=1;
  for (let it=0;it<30;it++){const nx=rr*ex+rg*ey+rb*ez,ny=rg*ex+gg*ey+gb*ez,nz=rb*ex+gb*ey+bb*ez;const n=Math.hypot(nx,ny,nz)||1; ex=nx/n;ey=ny/n;ez=nz/n;}
  let pMin=Infinity,pMax=-Infinity;
  const proj=data.map(p=>{const v=(p.r-mr)*ex+(p.g-mg)*ey+(p.b-mb)*ez; if(v<pMin)pMin=v; if(v>pMax)pMax=v; return v;});
  const W=new Float64Array(M),S=new Float64Array(M),S2=new Float64Array(M);
  const SR_b=new Float64Array(M),SG_b=new Float64Array(M),SB_b=new Float64Array(M);
  const range=pMax-pMin||1;
  for (let i=0;i<data.length;i++){
    const b=Math.max(0,Math.min(M-1,Math.floor((proj[i]-pMin)/range*(M-1e-9))));
    const w=data[i].w,v=proj[i];
    W[b]+=w; S[b]+=w*v; S2[b]+=w*v*v;
    SR_b[b]+=w*data[i].r; SG_b[b]+=w*data[i].g; SB_b[b]+=w*data[i].b;
  }
  const cW=new Float64Array(M+1),cS=new Float64Array(M+1),cS2=new Float64Array(M+1);
  for (let i=0;i<M;i++){cW[i+1]=cW[i]+W[i];cS[i+1]=cS[i]+S[i];cS2[i+1]=cS2[i]+S2[i];}
  const sseRange=(i,j)=>{const w=cW[j]-cW[i]; if (w<=0) return 0; const s=cS[j]-cS[i]; return (cS2[j]-cS2[i]) - s*s/w;};
  const D=Array.from({length:k+1},()=>new Float64Array(M+1).fill(Infinity));
  const P=Array.from({length:k+1},()=>new Int32Array(M+1));
  D[0][0]=0;
  for (let kk=1;kk<=k;kk++) for (let j=kk;j<=M;j++) for (let i=kk-1;i<j;i++){
    const v=D[kk-1][i]+sseRange(i,j);
    if (v<D[kk][j]){D[kk][j]=v;P[kk][j]=i;}
  }
  const cuts=[M]; let j=M;
  for (let kk=k;kk>=1;kk--){j=P[kk][j]; cuts.push(j);}
  cuts.reverse();
  const palette=[];
  for (let p=0;p<k;p++){
    let w=0,r=0,g=0,b=0;
    for (let i=cuts[p];i<cuts[p+1];i++){w+=W[i]; r+=SR_b[i]; g+=SG_b[i]; b+=SB_b[i];}
    if (w>0) palette.push([Math.round(r/w),Math.round(g/w),Math.round(b/w)]);
  }
  return palette;
}

// --- Center-Cut / MaxCoverage (Joy-Xiang 1993 / Pillow) ---
function centerCutPalette(pixels, k, opts = {}) {
  const mode = opts.mode ?? "centercut";
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  function boxFrom(slice) {
    let rmin=255,rmax=0,gmin=255,gmax=0,bmin=255,bmax=0, sw=0,sr=0,sg=0,sb=0;
    for (const p of slice){
      if(p.r<rmin)rmin=p.r; if(p.r>rmax)rmax=p.r;
      if(p.g<gmin)gmin=p.g; if(p.g>gmax)gmax=p.g;
      if(p.b<bmin)bmin=p.b; if(p.b>bmax)bmax=p.b;
      sw+=p.w; sr+=p.r*p.w; sg+=p.g*p.w; sb+=p.b*p.w;
    }
    const dr=rmax-rmin,dg=gmax-gmin,db=bmax-bmin;
    const axis = (dr>=dg&&dr>=db)?0:(dg>=db?1:2);
    const range = Math.max(dr,dg,db);
    const center = axis===0?(rmin+rmax)/2:axis===1?(gmin+gmax)/2:(bmin+bmax)/2;
    const volume = (dr+1)*(dg+1)*(db+1);
    const priority = mode==="centercut" ? range : volume*Math.cbrt(sw);
    return {slice, axis, center, priority, mr:sr/sw, mg:sg/sw, mb:sb/sw, sw};
  }
  let boxes=[boxFrom(data)];
  while (boxes.length<k){
    let bi=0; for(let i=1;i<boxes.length;i++) if (boxes[i].priority>boxes[bi].priority) bi=i;
    const box=boxes[bi];
    if (box.slice.length<2 || box.priority<=0) break;
    const key=box.axis===0?'r':box.axis===1?'g':'b';
    const left=[],right=[];
    for (const p of box.slice) (p[key]<=box.center?left:right).push(p);
    if (!left.length||!right.length){box.priority=0; continue;}
    boxes.splice(bi,1, boxFrom(left), boxFrom(right));
  }
  return boxes.map(b=>[Math.round(b.mr),Math.round(b.mg),Math.round(b.mb)]);
}
function maxCoveragePalette(pixels, k) { return centerCutPalette(pixels, k, { mode: "maxcoverage" }); }

// --- PNN (Equitz 1989, pairwise nearest neighbor) ---
function pnnPalette(pixels, k) {
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const C = data.map(p => ({ r:p.r, g:p.g, b:p.b, w:p.w, alive:true, nn:-1, nd:Infinity }));
  function mergeCost(a,b){const f=(a.w*b.w)/(a.w+b.w); const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b; return f*(dr*dr+dg*dg+db*db);}
  function findNN(idx){let best=-1,bv=Infinity; const a=C[idx]; for(let j=0;j<C.length;j++){if(j===idx||!C[j].alive)continue; const d=mergeCost(a,C[j]); if(d<bv){bv=d;best=j;}} a.nn=best;a.nd=bv;}
  for (let i=0;i<C.length;i++) findNN(i);
  let alive = C.length;
  while (alive > k){
    let bi=-1, bv=Infinity;
    for (let i=0;i<C.length;i++) if (C[i].alive && C[i].nd<bv){bv=C[i].nd;bi=i;}
    if (bi<0) break;
    const bj = C[bi].nn;
    const a=C[bi], b=C[bj];
    const w=a.w+b.w;
    a.r=(a.r*a.w+b.r*b.w)/w; a.g=(a.g*a.w+b.g*b.w)/w; a.b=(a.b*a.w+b.b*b.w)/w; a.w=w;
    b.alive=false; alive--;
    findNN(bi);
    for (let i=0;i<C.length;i++){
      if (!C[i].alive || i===bi) continue;
      if (C[i].nn===bi || C[i].nn===bj) findNN(i);
      else {const d=mergeCost(C[i],a); if (d<C[i].nd){C[i].nd=d; C[i].nn=bi;}}
    }
  }
  return C.filter(c=>c.alive).map(c=>[Math.round(c.r),Math.round(c.g),Math.round(c.b)]);
}

// --- SCQ (Puzicha 2000 spatial color quantization) - REQUIRES width & height ---
function scqPalette(pixels, k, opts = {}) {
  const width = opts.width, height = opts.height;
  if (!width || !height) throw new Error("SCQ requires opts.width and opts.height");
  const iters = opts.iters ?? 3;
  const filters = opts.filters ?? [2, 1];
  const N = width*height;
  const Lab = new Float32Array(N*3);
  for (let i=0,j=0;i<pixels.length;i+=4,j+=3){
    const [L,a,b]=ext_srgbToOklab(pixels[i],pixels[i+1],pixels[i+2]);
    Lab[j]=L; Lab[j+1]=a; Lab[j+2]=b;
  }
  const palette = new Float32Array(k*3);
  const idx0=(Math.random()*N)|0;
  palette.set([Lab[idx0*3],Lab[idx0*3+1],Lab[idx0*3+2]], 0);
  const d2arr=new Float32Array(N).fill(Infinity);
  for (let m=1;m<k;m++){
    let sum=0;
    for (let i=0;i<N;i++){
      const dL=Lab[i*3]-palette[(m-1)*3],da=Lab[i*3+1]-palette[(m-1)*3+1],db=Lab[i*3+2]-palette[(m-1)*3+2];
      const d=dL*dL+da*da+db*db; if (d<d2arr[i]) d2arr[i]=d; sum+=d2arr[i];
    }
    let r=Math.random()*sum,c=0,chosen=0;
    for (let i=0;i<N;i++){c+=d2arr[i]; if(c>=r){chosen=i; break;}}
    palette.set([Lab[chosen*3],Lab[chosen*3+1],Lab[chosen*3+2]], m*3);
  }
  const assign = new Int32Array(N);
  for (const radius of filters){
    for (let outer=0; outer<iters; outer++){
      for (let y=0;y<height;y++) for (let x=0;x<width;x++){
        const p=y*width+x;
        let bestJ=0,bestE=Infinity;
        for (let j=0;j<k;j++){
          let e=0;
          for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius;dx<=radius;dx++){
            const xx=x+dx,yy=y+dy;
            if (xx<0||yy<0||xx>=width||yy>=height) continue;
            const q=yy*width+xx;
            const a=(q===p)?j:assign[q];
            const dL=palette[a*3]-Lab[q*3],da=palette[a*3+1]-Lab[q*3+1],db=palette[a*3+2]-Lab[q*3+2];
            e += dL*dL+da*da+db*db;
          }
          if (e<bestE){bestE=e; bestJ=j;}
        }
        assign[p]=bestJ;
      }
      const acc=new Float32Array(k*4);
      for (let i=0;i<N;i++){const j=assign[i]*4; acc[j]+=Lab[i*3]; acc[j+1]+=Lab[i*3+1]; acc[j+2]+=Lab[i*3+2]; acc[j+3]++;}
      for (let j=0;j<k;j++) if (acc[j*4+3]>0){palette[j*3]=acc[j*4]/acc[j*4+3]; palette[j*3+1]=acc[j*4+1]/acc[j*4+3]; palette[j*3+2]=acc[j*4+2]/acc[j*4+3];}
    }
  }
  const out=[];
  for (let j=0;j<k;j++) out.push(ext_oklabToSrgb(palette[j*3], palette[j*3+1], palette[j*3+2]));
  return out;
}

// --- FCM (Fuzzy c-means in OKLab) ---
function fcmPalette(pixels, k, opts = {}) {
  const m = opts.m ?? 2.0, maxIter = opts.maxIter ?? 15, tol = opts.tol ?? 1e-3;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const N = data.length;
  const lab = data.map(p => ext_srgbToOklab(p.r,p.g,p.b));
  const centroids = [lab[(Math.random()*N)|0].slice()];
  const d2arr = new Float32Array(N).fill(Infinity);
  for (let i=1;i<k;i++){
    let sum=0;
    for (let j=0;j<N;j++){
      const dL=lab[j][0]-centroids[i-1][0],da=lab[j][1]-centroids[i-1][1],db=lab[j][2]-centroids[i-1][2];
      const dd=dL*dL+da*da+db*db; if (dd<d2arr[j]) d2arr[j]=dd; sum+=d2arr[j]*data[j].w;
    }
    let r=Math.random()*sum,c=0,chosen=0;
    for (let j=0;j<N;j++){c+=d2arr[j]*data[j].w; if(c>=r){chosen=j; break;}}
    centroids.push(lab[chosen].slice());
  }
  let prevJ=Infinity; const exp=1/(m-1);
  for (let it=0; it<maxIter; it++){
    const num=Array.from({length:k},()=>[0,0,0]); const den=new Float64Array(k);
    let J=0;
    for (let i=0;i<N;i++){
      const dists=new Float64Array(k); let zero=-1;
      for (let j=0;j<k;j++){const dL=lab[i][0]-centroids[j][0],da=lab[i][1]-centroids[j][1],db=lab[i][2]-centroids[j][2]; const d=dL*dL+da*da+db*db; dists[j]=d; if (d<1e-12) zero=j;}
      const u=new Float64Array(k);
      if (zero>=0) u[zero]=1;
      else { let denom=0; for (let j=0;j<k;j++) denom+=Math.pow(1/dists[j],exp); for (let j=0;j<k;j++) u[j]=Math.pow(1/dists[j],exp)/denom; }
      const w=data[i].w;
      for (let j=0;j<k;j++){const um=Math.pow(u[j],m)*w; J+=um*dists[j]; num[j][0]+=um*lab[i][0]; num[j][1]+=um*lab[i][1]; num[j][2]+=um*lab[i][2]; den[j]+=um;}
    }
    for (let j=0;j<k;j++) if (den[j]>0) centroids[j]=[num[j][0]/den[j],num[j][1]/den[j],num[j][2]/den[j]];
    if (Math.abs(prevJ-J)<tol*Math.max(1,prevJ)) break;
    prevJ=J;
  }
  return centroids.map(c => ext_oklabToSrgb(c[0],c[1],c[2]));
}

// --- libimagequant-style hybrid (Lesinski 2009-) - REQUIRES width & height ---
function liqPalette(pixels, k, opts = {}) {
  const width = opts.width, height = opts.height;
  if (!width || !height) throw new Error("libimagequant requires opts.width and opts.height");
  const speed = Math.max(1, Math.min(10, opts.speed ?? 6));
  const refineIters = Math.max(1, 8 - Math.floor(speed*0.8));
  const kmeansIters = Math.max(1, 12 - speed);
  const W = width, H = height, stride = W*4;
  const hist = new Map();
  function importance(x,y){
    const lumas=[];
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const xx=Math.max(0,Math.min(W-1,x+dx)), yy=Math.max(0,Math.min(H-1,y+dy));
      const o=yy*stride+xx*4;
      lumas.push(0.2126*pixels[o]+0.7152*pixels[o+1]+0.0722*pixels[o+2]);
    }
    const mean=lumas.reduce((a,b)=>a+b)/9;
    let v=0; for (const l of lumas) v+=(l-mean)*(l-mean); v/=9;
    return Math.max(0.1, 1 - Math.min(1, v/600));
  }
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){
    const o=y*stride+x*4, a=pixels[o+3];
    if (a<8) continue;
    const aw=a/255, imp=importance(x,y)*aw;
    const r=pixels[o],g=pixels[o+1],b=pixels[o+2];
    const key=((r>>2)<<12)|((g>>2)<<6)|(b>>2);
    let e=hist.get(key);
    if (!e) hist.set(key, {r,g,b,w:imp,error:0});
    else e.w+=imp;
  }
  const items = Array.from(hist.values());
  if (!items.length) return [];
  function statsOf(slice){
    let sw=0,sr=0,sg=0,sb=0;
    for (const p of slice){sw+=p.w;sr+=p.r*p.w;sg+=p.g*p.w;sb+=p.b*p.w;}
    const mr=sr/sw,mg=sg/sw,mb=sb/sw;
    let vR=0,vG=0,vB=0;
    for (const p of slice){vR+=p.w*(p.r-mr)*(p.r-mr); vG+=p.w*(p.g-mg)*(p.g-mg); vB+=p.w*(p.b-mb)*(p.b-mb);}
    const totalVar=vR+vG+vB;
    const axis = vR>=vG&&vR>=vB?0:vG>=vB?1:2;
    return {mr,mg,mb,sw,axis,totalVar};
  }
  function medianCut(items, k){
    let boxes=[{slice:items, ...statsOf(items)}];
    while (boxes.length<k){
      let bi=0; for (let i=1;i<boxes.length;i++) if (boxes[i].totalVar>boxes[bi].totalVar) bi=i;
      const box=boxes[bi];
      if (box.slice.length<2 || box.totalVar<1e-6) break;
      const key=box.axis===0?'r':box.axis===1?'g':'b';
      box.slice.sort((a,b)=>a[key]-b[key]);
      let halfW=box.sw/2, acc=0, splitIdx=0;
      for (let i=0;i<box.slice.length;i++){acc+=box.slice[i].w; if(acc>=halfW){splitIdx=i; break;}}
      if (splitIdx===0) splitIdx=1;
      if (splitIdx>=box.slice.length) splitIdx=box.slice.length-1;
      const left=box.slice.slice(0,splitIdx), right=box.slice.slice(splitIdx);
      if (!left.length||!right.length){box.totalVar=0; continue;}
      boxes.splice(bi,1, {slice:left,...statsOf(left)}, {slice:right,...statsOf(right)});
    }
    return boxes;
  }
  let palette = medianCut(items,k).map(b=>({r:b.mr,g:b.mg,b:b.mb}));
  for (let outer=0; outer<refineIters; outer++){
    for (const p of items){let bd=Infinity; for (const c of palette){const dr=p.r-c.r,dg=p.g-c.g,db=p.b-c.b; const d=dr*dr+dg*dg+db*db; if(d<bd) bd=d;} p.error=bd;}
    const work = items.map(p=>({...p, w:p.w*(1+Math.min(4,p.error/1500))}));
    palette = medianCut(work,k).map(b=>({r:b.mr,g:b.mg,b:b.mb}));
  }
  for (let it=0; it<kmeansIters; it++){
    const acc = palette.map(()=>({sr:0,sg:0,sb:0,sw:0}));
    for (const p of items){
      let bj=0,bd=Infinity;
      for (let j=0;j<palette.length;j++){const dr=p.r-palette[j].r,dg=p.g-palette[j].g,db=p.b-palette[j].b; const d=dr*dr+dg*dg+db*db; if(d<bd){bd=d;bj=j;}}
      acc[bj].sr+=p.r*p.w; acc[bj].sg+=p.g*p.w; acc[bj].sb+=p.b*p.w; acc[bj].sw+=p.w;
    }
    let moved=0;
    for (let j=0;j<palette.length;j++) if (acc[j].sw>0){
      const nr=acc[j].sr/acc[j].sw, ng=acc[j].sg/acc[j].sw, nb=acc[j].sb/acc[j].sw;
      moved+=Math.abs(nr-palette[j].r)+Math.abs(ng-palette[j].g)+Math.abs(nb-palette[j].b);
      palette[j]={r:nr,g:ng,b:nb};
    }
    if (moved<0.5) break;
  }
  return palette.map(c=>[Math.round(c.r),Math.round(c.g),Math.round(c.b)]);
}

// --- PSO (Omran-Engelbrecht 2005) ---
function psoPalette(pixels, k, opts = {}) {
  const S = opts.particles ?? 12;
  const iters = opts.iters ?? 20;
  const w=opts.w??0.72, c1=opts.c1??1.49, c2=opts.c2??1.49;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const N = data.length, dim = k*3;
  function fitness(pal){let total=0,W=0; for (let i=0;i<N;i++){const p=data[i]; let bd=Infinity; for (let j=0;j<k;j++){const dr=p.r-pal[j*3],dg=p.g-pal[j*3+1],db=p.b-pal[j*3+2]; const d=dr*dr+dg*dg+db*db; if(d<bd)bd=d;} total+=bd*p.w; W+=p.w;} return total/W;}
  function lloyd(pal){const acc=new Float64Array(k*4); for (let i=0;i<N;i++){const p=data[i]; let bj=0,bd=Infinity; for (let j=0;j<k;j++){const dr=p.r-pal[j*3],dg=p.g-pal[j*3+1],db=p.b-pal[j*3+2]; const d=dr*dr+dg*dg+db*db; if(d<bd){bd=d;bj=j;}} acc[bj*4]+=p.r*p.w; acc[bj*4+1]+=p.g*p.w; acc[bj*4+2]+=p.b*p.w; acc[bj*4+3]+=p.w;} for (let j=0;j<k;j++) if (acc[j*4+3]>0){pal[j*3]=acc[j*4]/acc[j*4+3]; pal[j*3+1]=acc[j*4+1]/acc[j*4+3]; pal[j*3+2]=acc[j*4+2]/acc[j*4+3];}}
  const swarm = [];
  for (let s=0;s<S;s++){
    const x=new Float32Array(dim), v=new Float32Array(dim);
    for (let j=0;j<k;j++){const p=data[(Math.random()*N)|0]; x[j*3]=p.r; x[j*3+1]=p.g; x[j*3+2]=p.b;}
    swarm.push({x, v, pbest:x.slice(), pbestFit:Infinity});
  }
  let gbest=swarm[0].x.slice(), gbestFit=Infinity;
  for (let t=0;t<iters;t++){
    for (const p of swarm){lloyd(p.x); const f=fitness(p.x); if(f<p.pbestFit){p.pbestFit=f; p.pbest=p.x.slice();} if(f<gbestFit){gbestFit=f; gbest=p.x.slice();}}
    for (const p of swarm) for (let d=0;d<dim;d++){const r1=Math.random(),r2=Math.random(); p.v[d]=w*p.v[d]+c1*r1*(p.pbest[d]-p.x[d])+c2*r2*(gbest[d]-p.x[d]); p.x[d]=Math.max(0,Math.min(255,p.x[d]+p.v[d]));}
  }
  const out=[];
  for (let j=0;j<k;j++) out.push([Math.round(gbest[j*3]),Math.round(gbest[j*3+1]),Math.round(gbest[j*3+2])]);
  return out;
}

// --- GA (Scheunders 1997 genetic c-means) ---
function gaPalette(pixels, k, opts = {}) {
  const P = opts.population ?? 16;
  const gens = opts.generations ?? 30;
  const mutRate = opts.mutationRate ?? 0.1;
  const sigma = opts.sigma ?? 8;
  const tournamentSize = opts.tournament ?? 3;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const N = data.length;
  function randomPal(){const pal=new Float32Array(k*3); for (let j=0;j<k;j++){const p=data[(Math.random()*N)|0]; pal[j*3]=p.r; pal[j*3+1]=p.g; pal[j*3+2]=p.b;} return pal;}
  function lloyd(pal){const acc=new Float64Array(k*4); for (let i=0;i<N;i++){const p=data[i]; let bj=0,bd=Infinity; for (let j=0;j<k;j++){const dr=p.r-pal[j*3],dg=p.g-pal[j*3+1],db=p.b-pal[j*3+2]; const d=dr*dr+dg*dg+db*db; if(d<bd){bd=d;bj=j;}} acc[bj*4]+=p.r*p.w; acc[bj*4+1]+=p.g*p.w; acc[bj*4+2]+=p.b*p.w; acc[bj*4+3]+=p.w;} for (let j=0;j<k;j++) if (acc[j*4+3]>0){pal[j*3]=acc[j*4]/acc[j*4+3]; pal[j*3+1]=acc[j*4+1]/acc[j*4+3]; pal[j*3+2]=acc[j*4+2]/acc[j*4+3];}}
  function fitness(pal){let total=0,W=0; for (let i=0;i<N;i++){const p=data[i]; let bd=Infinity; for (let j=0;j<k;j++){const dr=p.r-pal[j*3],dg=p.g-pal[j*3+1],db=p.b-pal[j*3+2]; const d=dr*dr+dg*dg+db*db; if(d<bd)bd=d;} total+=bd*p.w; W+=p.w;} return total/W;}
  function crossover(a,b){const c=new Float32Array(k*3); for (let j=0;j<k;j++){const src=Math.random()<0.5?a:b; c[j*3]=src[j*3]; c[j*3+1]=src[j*3+1]; c[j*3+2]=src[j*3+2];} return c;}
  function mutate(pal){for (let j=0;j<k;j++) if (Math.random()<mutRate) for (let c=0;c<3;c++){const v=pal[j*3+c]+(Math.random()*2-1)*sigma; pal[j*3+c]=Math.max(0,Math.min(255,v));}}
  let pop = []; for (let p=0;p<P;p++){const pal=randomPal(); lloyd(pal); pop.push({pal, fit:fitness(pal)});}
  for (let gen=0; gen<gens; gen++){
    pop.sort((a,b)=>a.fit-b.fit);
    const next=[pop[0],pop[1]];
    while (next.length<P){
      function tourney(){let best=pop[(Math.random()*P)|0]; for (let t=1;t<tournamentSize;t++){const c=pop[(Math.random()*P)|0]; if(c.fit<best.fit) best=c;} return best.pal;}
      const child=crossover(tourney(),tourney()); mutate(child); lloyd(child);
      next.push({pal:child, fit:fitness(child)});
    }
    pop=next;
  }
  pop.sort((a,b)=>a.fit-b.fit);
  const best=pop[0].pal;
  const out=[];
  for (let j=0;j<k;j++) out.push([Math.round(best[j*3]),Math.round(best[j*3+1]),Math.round(best[j*3+2])]);
  return out;
}

// --- SA (simulated annealing) ---
function saPalette(pixels, k, opts = {}) {
  const iters = opts.iters ?? 2000;
  const T0 = opts.T0 ?? 1000;
  const alpha = opts.alpha ?? 0.998;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const N = data.length;
  function fitness(pal){let total=0; for (let i=0;i<N;i++){const p=data[i]; let bd=Infinity; for (let j=0;j<k;j++){const dr=p.r-pal[j*3],dg=p.g-pal[j*3+1],db=p.b-pal[j*3+2]; const d=dr*dr+dg*dg+db*db; if(d<bd)bd=d;} total+=bd*p.w;} return total;}
  const pal=new Float32Array(k*3);
  pal[0]=data[(Math.random()*N)|0].r; pal[1]=data[(Math.random()*N)|0].g; pal[2]=data[(Math.random()*N)|0].b;
  const d2arr=new Float32Array(N).fill(Infinity);
  for (let m=1;m<k;m++){let sum=0; for (let i=0;i<N;i++){const p=data[i]; const dr=p.r-pal[(m-1)*3],dg=p.g-pal[(m-1)*3+1],db=p.b-pal[(m-1)*3+2]; const d=dr*dr+dg*dg+db*db; if(d<d2arr[i]) d2arr[i]=d; sum+=d2arr[i]*p.w;} let r=Math.random()*sum,c=0,idx=0; for (let i=0;i<N;i++){c+=d2arr[i]*data[i].w; if(c>=r){idx=i; break;}} pal[m*3]=data[idx].r; pal[m*3+1]=data[idx].g; pal[m*3+2]=data[idx].b;}
  let curE=fitness(pal), bestPal=pal.slice(), bestE=curE, T=T0;
  for (let it=0; it<iters; it++){
    const j=(Math.random()*k)|0; const sigma=Math.sqrt(T)*0.3;
    const oR=pal[j*3], oG=pal[j*3+1], oB=pal[j*3+2];
    pal[j*3]=Math.max(0,Math.min(255,oR+(Math.random()*2-1)*sigma));
    pal[j*3+1]=Math.max(0,Math.min(255,oG+(Math.random()*2-1)*sigma));
    pal[j*3+2]=Math.max(0,Math.min(255,oB+(Math.random()*2-1)*sigma));
    const newE=fitness(pal);
    if (newE<curE || Math.random()<Math.exp(-(newE-curE)/T)){curE=newE; if(curE<bestE){bestE=curE; bestPal=pal.slice();}}
    else {pal[j*3]=oR; pal[j*3+1]=oG; pal[j*3+2]=oB;}
    T*=alpha; if (T<0.01) break;
  }
  const out=[];
  for (let j=0;j<k;j++) out.push([Math.round(bestPal[j*3]),Math.round(bestPal[j*3+1]),Math.round(bestPal[j*3+2])]);
  return out;
}

// --- GMM (Gaussian mixture in OKLab) ---
function gmmPalette(pixels, k, opts = {}) {
  const maxIter = opts.maxIter ?? 20, tol = opts.tol ?? 1e-3, ridge = opts.ridge ?? 1e-3;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const N = data.length;
  const X = data.map(p => ext_srgbToOklab(p.r,p.g,p.b));
  const mu=[X[(Math.random()*N)|0].slice()];
  const d2arr=new Float32Array(N).fill(Infinity);
  for (let m=1;m<k;m++){let sum=0; for (let i=0;i<N;i++){const dL=X[i][0]-mu[m-1][0],da=X[i][1]-mu[m-1][1],db=X[i][2]-mu[m-1][2]; const d=dL*dL+da*da+db*db; if(d<d2arr[i]) d2arr[i]=d; sum+=d2arr[i]*data[i].w;} let r=Math.random()*sum,c=0,idx=0; for (let i=0;i<N;i++){c+=d2arr[i]*data[i].w; if(c>=r){idx=i; break;}} mu.push(X[idx].slice());}
  let pi=new Float64Array(k).fill(1/k);
  let Sigma=Array.from({length:k},()=>[[0.01,0,0],[0,0.01,0],[0,0,0.01]]);
  function detInv3(M){const a=M[0][0],b=M[0][1],c=M[0][2],d=M[1][0],e=M[1][1],f=M[1][2],g=M[2][0],h=M[2][1],i=M[2][2]; const det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g); if (Math.abs(det)<1e-20) return null; const inv=[[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]]; return {det,inv};}
  function logN(x,mu_j,Sigma_j){const di=detInv3(Sigma_j); if(!di) return -1e30; const dx=[x[0]-mu_j[0],x[1]-mu_j[1],x[2]-mu_j[2]]; let q=0; for (let a=0;a<3;a++) for (let b=0;b<3;b++) q+=dx[a]*di.inv[a][b]*dx[b]; return -0.5*(3*Math.log(2*Math.PI)+Math.log(Math.abs(di.det))+q);}
  let prevLL=-Infinity;
  for (let it=0; it<maxIter; it++){
    const gamma=new Float64Array(N*k); let LL=0;
    for (let i=0;i<N;i++){const lp=new Float64Array(k); for (let j=0;j<k;j++) lp[j]=Math.log(Math.max(1e-30,pi[j]))+logN(X[i],mu[j],Sigma[j]); const M=Math.max(...lp); let sE=0; for (let j=0;j<k;j++) sE+=Math.exp(lp[j]-M); const lS=M+Math.log(sE); LL+=data[i].w*lS; for (let j=0;j<k;j++) gamma[i*k+j]=Math.exp(lp[j]-lS);}
    const Nk=new Float64Array(k); const newMu=Array.from({length:k},()=>[0,0,0]);
    for (let i=0;i<N;i++){const w=data[i].w; for (let j=0;j<k;j++){const wg=w*gamma[i*k+j]; Nk[j]+=wg; newMu[j][0]+=wg*X[i][0]; newMu[j][1]+=wg*X[i][1]; newMu[j][2]+=wg*X[i][2];}}
    for (let j=0;j<k;j++) if (Nk[j]>0) for (let a=0;a<3;a++) newMu[j][a]/=Nk[j];
    const newSig=Array.from({length:k},()=>[[ridge,0,0],[0,ridge,0],[0,0,ridge]]);
    for (let i=0;i<N;i++){const w=data[i].w; for (let j=0;j<k;j++){const wg=w*gamma[i*k+j]; if(wg<1e-12) continue; const dx=[X[i][0]-newMu[j][0],X[i][1]-newMu[j][1],X[i][2]-newMu[j][2]]; for (let a=0;a<3;a++) for (let b=0;b<3;b++) newSig[j][a][b]+=wg*dx[a]*dx[b];}}
    const totN=Nk.reduce((s,v)=>s+v,0);
    for (let j=0;j<k;j++){if(Nk[j]>0) for (let a=0;a<3;a++) for (let b=0;b<3;b++) newSig[j][a][b]/=Nk[j]; pi[j]=Nk[j]/totN;}
    mu.splice(0,k,...newMu); Sigma=newSig;
    if (Math.abs(LL-prevLL)<tol*Math.abs(LL)) break;
    prevLL=LL;
  }
  return mu.map(m=>ext_oklabToSrgb(m[0],m[1],m[2]));
}

// --- Mean-Shift (Comaniciu-Meer 2002) ---
function meanShiftPalette(pixels, k, opts = {}) {
  const h = opts.bandwidth ?? 18, maxIter = opts.maxIter ?? 10;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const h2 = h*h;
  const seeds = data.map(p => ({r:p.r,g:p.g,b:p.b,w:p.w}));
  for (let it=0; it<maxIter; it++){
    let maxMove=0;
    for (const s of seeds){
      let sw=0,sr=0,sg=0,sb=0;
      for (const p of data){
        const dr=s.r-p.r,dg=s.g-p.g,db=s.b-p.b; const d=dr*dr+dg*dg+db*db;
        if (d<h2*4){const k_=Math.exp(-d/(2*h2))*p.w; sw+=k_; sr+=p.r*k_; sg+=p.g*k_; sb+=p.b*k_;}
      }
      if (sw>0){const nr=sr/sw,ng=sg/sw,nb=sb/sw; maxMove=Math.max(maxMove,Math.abs(nr-s.r)+Math.abs(ng-s.g)+Math.abs(nb-s.b)); s.r=nr;s.g=ng;s.b=nb;}
    }
    if (maxMove<0.2) break;
  }
  const modes=[]; const r2=(h/2)*(h/2);
  for (const s of seeds){
    let found=null;
    for (const m of modes){const dr=m.r-s.r,dg=m.g-s.g,db=m.b-s.b; if (dr*dr+dg*dg+db*db<r2){found=m; break;}}
    if (found){const w=found.w+s.w; found.r=(found.r*found.w+s.r*s.w)/w; found.g=(found.g*found.w+s.g*s.w)/w; found.b=(found.b*found.w+s.b*s.w)/w; found.w=w;}
    else modes.push({r:s.r,g:s.g,b:s.b,w:s.w});
  }
  while (modes.length>k){
    let bi=0,bj=1,bd=Infinity;
    for (let i=0;i<modes.length;i++) for (let j=i+1;j<modes.length;j++){const dr=modes[i].r-modes[j].r,dg=modes[i].g-modes[j].g,db=modes[i].b-modes[j].b; const wf=(modes[i].w*modes[j].w)/(modes[i].w+modes[j].w); const d=wf*(dr*dr+dg*dg+db*db); if(d<bd){bd=d;bi=i;bj=j;}}
    const a=modes[bi], b=modes[bj], w=a.w+b.w;
    modes[bi]={r:(a.r*a.w+b.r*b.w)/w,g:(a.g*a.w+b.g*b.w)/w,b:(a.b*a.w+b.b*b.w)/w,w};
    modes.splice(bj,1);
  }
  modes.sort((a,b)=>b.w-a.w);
  return modes.slice(0,k).map(m=>[Math.round(m.r),Math.round(m.g),Math.round(m.b)]);
}

// --- DBSCAN density-based (Ester 1996) ---
// Notes:
//  - ε is in OKLab × 100 units. The original default of 6 was too generous:
//    on smooth gradients (sunset, sky-to-ground photos) the entire color
//    distribution chain-links into one cluster. Lowered to 3, which separates
//    the typical photo into 2-4 modes and a UI mockup into all its components.
//  - DBSCAN returns ADAPTIVE K: if the image has fewer discrete color regions
//    than requested (e.g. a pure gradient has ~1 region), the palette will be
//    SHORTER than K. This is correct behavior, not a bug. PaletteLab's
//    diversity badge will correctly flag this as low.
//  - Best for UI mockups, illustrations, logos, and photos with distinct
//    color blocks. Weakest on smooth gradients.
function dbscanPalette(pixels, k, opts = {}) {
  const epsilon = opts.epsilon ?? 3, minPts = opts.minPts ?? 4;
  const data = ext_buildHistogram(pixels);
  if (!data.length) return [];
  const pts = data.map(p => {
    const [L,a,b] = ext_srgbToOklab(p.r, p.g, p.b);
    return { L: L*100, a: a*100, b: b*100, w: p.w, r: p.r, g: p.g, bb: p.b, label: 0 };
  });
  const N = pts.length;
  const eps2 = epsilon*epsilon;
  function neighbours(i) {
    const arr = [];
    const a = pts[i];
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const dL = a.L-pts[j].L, da = a.a-pts[j].a, db = a.b-pts[j].b;
      if (dL*dL+da*da+db*db <= eps2) arr.push(j);
    }
    return arr;
  }
  let cid = 0;
  for (let i = 0; i < N; i++) {
    if (pts[i].label !== 0) continue;
    const seeds = neighbours(i);
    const totalW = seeds.reduce((s,j)=>s+pts[j].w, pts[i].w);
    if (totalW < minPts) { pts[i].label = -1; continue; }
    cid++;
    pts[i].label = cid;
    const queue = seeds.slice();
    while (queue.length) {
      const q = queue.shift();
      if (pts[q].label === -1) pts[q].label = cid;
      if (pts[q].label !== 0) continue;
      pts[q].label = cid;
      const next = neighbours(q);
      const w = next.reduce((s,j)=>s+pts[j].w, pts[q].w);
      if (w >= minPts) for (const n of next) if (pts[n].label <= 0) queue.push(n);
    }
  }
  const cmap = new Map();
  for (const p of pts) {
    if (p.label <= 0) continue;
    let c = cmap.get(p.label);
    if (!c) { c = { sw:0, sr:0, sg:0, sb:0 }; cmap.set(p.label, c); }
    c.sw += p.w; c.sr += p.r*p.w; c.sg += p.g*p.w; c.sb += p.bb*p.w;
  }
  let clusters = Array.from(cmap.values()).map(c => ({
    r: c.sr/c.sw, g: c.sg/c.sw, b: c.sb/c.sw, w: c.sw
  }));
  clusters.sort((a,b)=>b.w-a.w);
  while (clusters.length > k) {
    let bi=0, bj=1, bd=Infinity;
    for (let i = 0; i < clusters.length; i++) for (let j = i+1; j < clusters.length; j++) {
      const dr=clusters[i].r-clusters[j].r, dg=clusters[i].g-clusters[j].g, db=clusters[i].b-clusters[j].b;
      const wf = (clusters[i].w*clusters[j].w)/(clusters[i].w+clusters[j].w);
      const d = wf*(dr*dr+dg*dg+db*db);
      if (d < bd) { bd=d; bi=i; bj=j; }
    }
    const a = clusters[bi], b2 = clusters[bj];
    const w = a.w + b2.w;
    clusters[bi] = { r:(a.r*a.w+b2.r*b2.w)/w, g:(a.g*a.w+b2.g*b2.w)/w, b:(a.b*a.w+b2.b*b2.w)/w, w };
    clusters.splice(bj, 1);
  }
  return clusters.slice(0, k).map(c => [Math.round(c.r), Math.round(c.g), Math.round(c.b)]);
}

// ===== EXTENDED ALGORITHMS END =====

// ============================================================================
// ALGORITHM REGISTRY
// ============================================================================
//
// SPEED TIERS — empirically measured on real images run through PaletteLab.
//
// Primary data: wall-clock measurements on actual photographs collected
// in-browser, with PaletteLab's default maxDim=256 downsampling active.
// A secondary benchmark (1920×1080, K=128, isolated Node.js child processes)
// is cited where it reveals scaling behaviour that real-image tests cannot
// (e.g. PNN and Mean-Shift explode with unique-color count on real photos).
//
//   Tier          Wall time         Real-image measurements (sorted)
//   ────────────────────────────────────────────────────────────────────────
//   realtime      <  100 ms         Octree(3) Popularity(5) Vibrant(10)
//                                   OB(10) MaxCoverage(10) Center-Cut(11)
//                                   MMCQ(18) Wu-1991(19) Wu-PCA-DP(26)
//                                   Median-Cut(28) K-Means++(47) LBG(96)
//
//   interactive   100 – 500 ms      NeuQuant(7ms→protected*) WWP(115)
//                                   FCM(252) libimagequant(253)
//
//   slow          500 ms – 2 s      DBSCAN(796) Spatial-CQ(1028) PSO+KM(1519)
//
//   prohibitive   > 2 s             GMM(2638) Genetic(2648) SA(5008)
//                                   PNN(13167) Mean-Shift(33034)
//
// * NeuQuant: measured 7ms on these images but protected at "interactive".
//   It ran 124ms (256×256 K=8) and 327ms (1920×1080 K=128) in the secondary
//   benchmark. Its O(N·cycles) full-pixel-buffer scan means it scales
//   linearly with image area, not just unique-color count.
//
// Notable surprises vs. the 1920×1080 synthetic benchmark:
//  - PNN 103ms → 13167ms: the synthetic test had ~100 unique 6-bit bins;
//    real photos have 1000-5000+. PNN's O(U²) initial neighbour scan and
//    O(U log U) merge loop are ruthlessly exposed by real-image histograms.
//  - Mean-Shift 213ms → 33034ms: identical root cause — O(U² · iters) over
//    the histogram. Real photos push unique-color counts 10-50× higher.
//  - DBSCAN 70ms → 796ms: the synthetic test terminated after finding only
//    3 clusters. Real images have richer distributions and more neighbours
//    to explore per point.
//  - Spatial-CQ: TIMEOUT at 1920×1080 K=128 but 1028ms here. Still "slow"
//    per its O(N·K·radius²·iters·filters) formula; raising K or disabling
//    maxDim=256 will push it back into prohibitive territory quickly.
//
// Practical guidance:
//   realtime    → run on every K/image change without pause
//   interactive → debounce 100-300 ms after slider changes
//   slow        → kick off explicitly; show progress; consider a Web Worker
//   prohibitive → Web Worker or explicit user request; abort on timeout
//
// ============================================================================

const TIER_COLOR = {
  realtime:    "#87a08c",  // sage green
  interactive: "#b8a87c",  // warm cream
  slow:        "#c08c5c",  // burnt orange
  prohibitive: "#b85c5c",  // muted red
};

const ALGORITHMS = [
  { id: "popularity", name: "Popularity", year: 1982, author: "Heckbert", speedTier: "realtime",
    family: "Histogram", fn: popularityPalette,
    blurb: "Quantize to 5 bits/channel, pick top-K most populous bins. Trivial; bad on photos; useful for flat graphics." },
  { id: "medianCut", name: "Median Cut", year: 1982, author: "Heckbert", speedTier: "realtime",
    family: "Splitting", fn: medianCutPalette,
    blurb: "Recursively split the RGB cube at the population median of its longest axis. The foundational algorithm." },
  { id: "mmcq", name: "MMCQ", year: 2008, author: "Bloomberg", speedTier: "realtime",
    family: "Splitting", fn: mmcqPalette,
    blurb: "Two-phase median cut: first split by population, then by population × volume to rescue vivid minorities. Color Thief's engine." },
  { id: "octree", name: "Octree", year: 1988, author: "Gervautz & Purgathofer", speedTier: "realtime",
    family: "Splitting", fn: octreePalette,
    blurb: "Build an 8-way bit-plane tree, fold least-populous leaves up until K remain. Constant memory; streams large images." },
  { id: "wu", name: "Wu", year: 1991, author: "Xiaolin Wu", speedTier: "realtime",
    family: "Splitting", fn: wuPalette,
    blurb: "Variance-minimizing greedy partition with 3D prefix-sum tables. Highest quality among non-iterative quantizers." },
  { id: "kmeans", name: "K-Means++", year: 2007, author: "Arthur & Vassilvitskii", speedTier: "realtime",
    family: "Iterative", fn: kmeansPalette,
    blurb: "Lloyd iterations seeded with k-means++ probability sampling. Lowest MSE if you can afford the iterations." },
  { id: "neuquant", name: "NeuQuant", year: 1994, author: "Dekker", speedTier: "interactive",
    family: "Neural", fn: neuQuantPalette,
    blurb: "Kohonen self-organizing map of K neurons that warp toward the image's color distribution. Powers most GIF encoders." },
  { id: "vibrant", name: "Vibrant", year: 2014, author: "Android Palette", speedTier: "realtime",
    family: "Splitting", fn: vibrantPalette,
    blurb: "Median cut split by volume (not population) — biased toward distinct hues, ideal for UI-theming palettes." },

  // ===== Extended panels =====
  // `needsImageDims: true` causes runAll() below to pass { width, height } in
  // opts. Only SCQ and libimagequant need spatial neighborhoods; everything
  // else operates on the histogram alone and ignores width/height.

  { id: "lbg", name: "LBG", year: 1980, author: "Linde-Buzo-Gray", speedTier: "realtime",
    family: "Iterative", fn: lbgPalette,
    blurb: "The granddaddy of iterative quantizers. Split each centroid by ±ε, run Lloyd, repeat. Predates k-means by two years." },
  { id: "wwp", name: "WWP", year: 1990, author: "Wan-Wong-Prusinkiewicz", speedTier: "interactive",
    family: "Splitting", fn: wwpPalette,
    blurb: "Variance-based splitting: pick the box with greatest SSE, cut at the Otsu-optimal threshold along its highest-variance axis." },
  { id: "orchardBouman", name: "Orchard-Bouman", year: 1991, author: "Orchard & Bouman", speedTier: "realtime",
    family: "Splitting", fn: orchardBoumanPalette,
    blurb: "PCA-aligned binary splitting. Lifts the axis-alignment restriction of WWP; cuts orthogonal to the color manifold." },
  { id: "wuPcaDp", name: "Wu PCA-DP", year: 1992, author: "Xiaolin Wu", speedTier: "realtime",
    family: "Optimal", fn: wuPcaDpPalette,
    blurb: "Globally optimal K-partition along the principal axis via dynamic programming. Strong on photos, weak on UI." },
  { id: "centerCut", name: "Center-Cut", year: 1993, author: "Joy & Xiang", speedTier: "realtime",
    family: "Splitting", fn: centerCutPalette,
    blurb: "Median-cut variant: split the box with the longest dimension at its center. Rescues vivid minority colors." },
  { id: "maxCoverage", name: "MaxCoverage", year: 1997, author: "Pillow / Xiang", speedTier: "realtime",
    family: "Splitting", fn: maxCoveragePalette,
    blurb: "Pillow's MAXCOVERAGE mode: split by volume × ∛count to favor sparse-but-distinct color regions. Great for icons." },
  { id: "pnn", name: "PNN", year: 1989, author: "Equitz", speedTier: "prohibitive",
    family: "Hierarchical", fn: pnnPalette,
    blurb: "Pairwise Nearest Neighbor. Bottom-up agglomerative under Ward merge cost. Beats k-means at small K." },
  { id: "scq", name: "Spatial CQ", year: 2000, author: "Puzicha et al.", speedTier: "slow",
    family: "Perceptual", fn: scqPalette, needsImageDims: true,
    blurb: "Joint palette + dither optimization. The reigning quality champion at K ≤ 16. Needs image dimensions." },
  { id: "fcm", name: "Fuzzy c-Means", year: 2002, author: "Özdemir-Akarun", speedTier: "interactive",
    family: "Iterative", fn: fcmPalette,
    blurb: "Soft assignments u_ij ∈ [0,1] instead of hard cluster membership, in OKLab. Smoother gradients than k-means." },
  { id: "liq", name: "libimagequant", year: 2009, author: "Lesinski", speedTier: "interactive",
    family: "Hybrid", fn: liqPalette, needsImageDims: true,
    blurb: "pngquant's engine: perception-weighted hist + variance median-cut + iterative reweighting + Lloyd refine. Needs dimensions." },
  { id: "pso", name: "PSO+KM", year: 2005, author: "Omran-Engelbrecht", speedTier: "slow",
    family: "Metaheuristic", fn: psoPalette,
    blurb: "Particle Swarm Optimization. Swarm of palettes evolves under personal+global best; one Lloyd step per particle per iter." },
  { id: "ga", name: "Genetic", year: 1997, author: "Scheunders", speedTier: "prohibitive",
    family: "Metaheuristic", fn: gaPalette,
    blurb: "Tournament selection, uniform crossover at the centroid level, Gaussian mutation, Lloyd polish per offspring (memetic)." },
  { id: "sa", name: "Sim. Annealing", year: 1983, author: "Kirkpatrick et al.", speedTier: "prohibitive",
    family: "Metaheuristic", fn: saPalette,
    blurb: "Single-state random search with Boltzmann acceptance and geometric cooling. Asymptotically global but slow to converge." },
  { id: "gmm", name: "GMM (OKLab)", year: 2012, author: "Cao et al.", speedTier: "prohibitive",
    family: "Statistical", fn: gmmPalette,
    blurb: "Gaussian mixture in OKLab via EM. Captures anisotropic clusters; palette = distribution modes, not Voronoi means." },
  { id: "meanShift", name: "Mean-Shift", year: 2002, author: "Comaniciu-Meer", speedTier: "prohibitive",
    family: "Density", fn: meanShiftPalette,
    blurb: "Non-parametric mode-finding. Returns the actual peaks of the color distribution. Best for 'dominant colors' aesthetic." },
  { id: "dbscan", name: "DBSCAN", year: 1996, author: "Ester et al.", speedTier: "slow",
    family: "Density", fn: dbscanPalette,
    blurb: "Density-based clustering in OKLab. Returns adaptive K — finds discrete dominant color regions, so smooth gradients collapse to 1-2 entries. Best for UI mockups and illustrations." },
];

// ============================================================================
// METRICS
// ============================================================================

// Mean squared error in RGB between original pixels and their nearest palette match.
function computeMSE(pixels, palette) {
  if (!palette.length) return Infinity;
  let total = 0, count = 0;
  // Sample stride for speed when image is large.
  const stride = Math.max(4, 4 * Math.floor((pixels.length / 4) / 30000));
  for (let i = 0; i < pixels.length; i += stride) {
    if (pixels[i + 3] < 125) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    let best = Infinity;
    for (const [pr, pg, pb] of palette) {
      const dr = r - pr, dg = g - pg, db = b - pb;
      const d = dr * dr + dg * dg + db * db;
      if (d < best) best = d;
    }
    total += best; count++;
  }
  return count ? total / count : 0;
}

// Average pairwise distance — palette diversity.
function paletteDiversity(palette) {
  if (palette.length < 2) return 0;
  let sum = 0, n = 0;
  for (let i = 0; i < palette.length; i++)
    for (let j = i + 1; j < palette.length; j++) {
      const dr = palette[i][0] - palette[j][0];
      const dg = palette[i][1] - palette[j][1];
      const db = palette[i][2] - palette[j][2];
      sum += Math.sqrt(dr * dr + dg * dg + db * db);
      n++;
    }
  return n ? sum / n : 0;
}

// ============================================================================
// HELPERS
// ============================================================================

const rgbToHex = ([r, g, b]) => "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
const rgbLuma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sortByLuma = (palette) => [...palette].sort((a, b) => rgbLuma(b) - rgbLuma(a));

// Generate a procedurally-painted sample image so users can run without uploading.
function makeSampleImage(w = 320, h = 320) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  // Dawn-sky gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0a1f3d");
  grad.addColorStop(0.45, "#7a3858");
  grad.addColorStop(0.7, "#e89368");
  grad.addColorStop(1, "#f4d9b0");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Sun.
  const sun = ctx.createRadialGradient(w * 0.7, h * 0.65, 4, w * 0.7, h * 0.65, 70);
  sun.addColorStop(0, "rgba(255, 230, 180, 0.95)");
  sun.addColorStop(1, "rgba(255, 230, 180, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  // Mountain silhouette.
  ctx.fillStyle = "#1a1620";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.7);
  for (let i = 0; i <= w; i += 20) {
    ctx.lineTo(i, h * (0.7 + 0.15 * Math.sin(i / 25) + 0.1 * Math.cos(i / 13)));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Scattered stars.
  ctx.fillStyle = "rgba(255, 255, 240, 0.7)";
  for (let i = 0; i < 30; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h * 0.4, 1.5, 1.5);
  }
  // A bird (or two).
  ctx.strokeStyle = "#0a0a0a";
  ctx.lineWidth = 1.5;
  for (const [x, y] of [[w * 0.3, h * 0.4], [w * 0.45, h * 0.3]]) {
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.quadraticCurveTo(x - 4, y - 4, x, y);
    ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y);
    ctx.stroke();
  }
  return c.toDataURL("image/png");
}

// Load an image source (data URL or file URL) into ImageData via canvas.
function loadImageData(src, maxDim = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width: w, height: h } = img;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ imageData: ctx.getImageData(0, 0, w, h), width: w, height: h });
    };
    img.onerror = reject;
    img.src = src;
  });
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function PaletteLab() {
  const [imageSrc, setImageSrc] = useState(null);
  const [imageData, setImageData] = useState(null);
  const [imageDims, setImageDims] = useState(null);
  const [k, setK] = useState(8);
  const [results, setResults] = useState({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [showRecolored, setShowRecolored] = useState(false);
  const [copiedHex, setCopiedHex] = useState(null);
  const fileInputRef = useRef(null);

  // Inject custom fonts.
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  // Load default sample on mount.
  useEffect(() => {
    if (!imageSrc) {
      const sample = makeSampleImage();
      setImageSrc(sample);
    }
  }, []);

  // When imageSrc changes, decode it into ImageData.
  useEffect(() => {
    if (!imageSrc) return;
    let cancelled = false;
    loadImageData(imageSrc).then(({ imageData, width, height }) => {
      if (cancelled) return;
      setImageData(imageData);
      setImageDims({ width, height });
      setResults({});
    }).catch(err => console.error("image load failed:", err));
    return () => { cancelled = true; };
  }, [imageSrc]);

  // Paste-from-clipboard support.
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items ?? [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          e.preventDefault();
          break;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => setImageSrc(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const onFileChange = (e) => handleFile(e.target.files?.[0]);
  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };
  const useSample = () => setImageSrc(makeSampleImage());

  const runAll = async () => {
    if (!imageData || running) return;
    setRunning(true);
    setResults({});
    setProgress({ current: 0, total: ALGORITHMS.length, name: "" });
    const newResults = {};
    for (let i = 0; i < ALGORITHMS.length; i++) {
      const algo = ALGORITHMS[i];
      setProgress({ current: i, total: ALGORITHMS.length, name: algo.name });
      await new Promise(r => setTimeout(r, 16)); // let UI breathe
      const start = performance.now();
      let palette = [];
      let error = null;
      try {
        // Most algorithms work on the color histogram alone and ignore opts.
        // SCQ and libimagequant (marked with `needsImageDims: true` in the
        // ALGORITHMS registry) additionally need the source image dimensions
        // because they operate on spatial neighborhoods, not just colors.
        // We pass width/height unconditionally — algorithms that don't need
        // them simply ignore the field.
        const opts = algo.needsImageDims
          ? { width: imageData.width, height: imageData.height }
          : undefined;
        palette = opts ? algo.fn(imageData.data, k, opts) : algo.fn(imageData.data, k);
      } catch (e) {
        error = e.message || String(e);
        console.error(algo.name, e);
      }
      const elapsed = performance.now() - start;
      const mse = error ? Infinity : computeMSE(imageData.data, palette);
      const diversity = error ? 0 : paletteDiversity(palette);
      newResults[algo.id] = { palette, elapsed, mse, diversity, error };
      setResults({ ...newResults });
    }
    setProgress(null);
    setRunning(false);
  };

  // Compute ranking badges.
  const ranking = useMemo(() => {
    const ids = Object.keys(results).filter(id => !results[id].error);
    if (!ids.length) return {};
    const fastest = ids.reduce((a, b) => results[a].elapsed < results[b].elapsed ? a : b);
    const bestQuality = ids.reduce((a, b) => results[a].mse < results[b].mse ? a : b);
    const mostDiverse = ids.reduce((a, b) => results[a].diversity > results[b].diversity ? a : b);
    return { fastest, bestQuality, mostDiverse };
  }, [results]);

  const copyHex = (hex) => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 1200);
    });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #1c1714 0%, #0a0807 50%, #050403 100%)",
        color: "#f4ede0",
        fontFamily: "'DM Sans', sans-serif",
        padding: "32px 24px 80px",
      }}
    >
      <style>{`
        body, html { background: #050403; }
        ::selection { background: #f4ede0; color: #050403; }
        .display { font-family: 'DM Serif Display', serif; font-weight: 400; letter-spacing: -0.02em; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .ridge { background-image: linear-gradient(90deg, transparent, #f4ede022 50%, transparent); height: 1px; }
        button:focus-visible { outline: 2px solid #d4a574; outline-offset: 3px; }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        {/* ---------- HEADER ---------- */}
        <header style={{ marginBottom: 48 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginBottom: 12, flexWrap: "wrap" }}>
            <div className="mono" style={{ fontSize: 11, color: "#8a7d6a", letterSpacing: "0.15em", textTransform: "uppercase" }}>
              vol. 01 · empirical color science
            </div>
            <div className="mono" style={{ fontSize: 11, color: "#8a7d6a", letterSpacing: "0.1em" }}>
              {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
          <h1 className="display" style={{ fontSize: "clamp(48px, 8vw, 112px)", lineHeight: 0.92, margin: 0 }}>
            Palette<span style={{ fontStyle: "italic", color: "#d4a574" }}>Lab</span>
          </h1>
          <div className="ridge" style={{ margin: "24px 0 16px" }} />
          <p style={{ fontSize: 17, maxWidth: 720, lineHeight: 1.55, color: "#c9bba3", margin: 0 }}>
            An empirical bench for the eight most-deployed color quantization algorithms — from Heckbert's 1982 median cut to Bloomberg's MMCQ
            and Dekker's neural net. Upload an image, choose <em style={{ color: "#d4a574" }}>K</em>, watch them race.
          </p>
        </header>

        {/* ---------- UPLOADER + CONTROLS ---------- */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 32, marginBottom: 48 }}>
          {/* Image dropzone / preview */}
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            style={{
              border: "1px solid #2a2420",
              background: "#100c09",
              padding: 20,
              position: "relative",
              minHeight: 340,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="mono" style={{
              fontSize: 10, letterSpacing: "0.2em", color: "#8a7d6a",
              textTransform: "uppercase", marginBottom: 12,
              display: "flex", justifyContent: "space-between"
            }}>
              <span>Specimen 01</span>
              <span>{imageDims ? `${imageDims.width}×${imageDims.height}` : "—"}</span>
            </div>
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              background: "#070504", border: "1px dashed #2a2420", position: "relative", overflow: "hidden",
            }}>
              {imageSrc ? (
                <img src={imageSrc} alt="specimen" style={{ maxWidth: "100%", maxHeight: 280, display: "block" }} />
              ) : (
                <div style={{ textAlign: "center", color: "#5a5048", padding: 32 }}>
                  <ImageIcon size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
                  <div style={{ fontSize: 14 }}>Drop, paste, or upload an image</div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={btnSecondary}
              >
                <Upload size={13} /> Upload
              </button>
              <button onClick={useSample} style={btnSecondary}>
                <Sparkles size={13} /> Sample
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: "none" }}
              />
            </div>
          </div>

          {/* Controls */}
          <div style={{
            border: "1px solid #2a2420", background: "#100c09",
            padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div className="mono" style={{
                fontSize: 10, letterSpacing: "0.2em", color: "#8a7d6a",
                textTransform: "uppercase", marginBottom: 24,
              }}>
                Experiment parameters
              </div>

              <div style={{ marginBottom: 28 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12,
                }}>
                  <label htmlFor="k-slider" className="display" style={{ fontSize: 28 }}>
                    Palette size
                  </label>
                  <span className="mono" style={{ fontSize: 32, color: "#d4a574" }}>K = {k}</span>
                </div>
                <input
                  id="k-slider"
                  type="range"
                  min="2"
                  max="32"
                  value={k}
                  onChange={(e) => setK(parseInt(e.target.value))}
                  disabled={running}
                  style={{ width: "100%", accentColor: "#d4a574" }}
                />
                <div className="mono" style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 10, color: "#5a5048", marginTop: 4,
                }}>
                  <span>2</span><span>8</span><span>16</span><span>24</span><span>32</span>
                </div>
              </div>

              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={() => setShowRecolored(!showRecolored)}
                  style={{
                    ...btnSecondary,
                    width: "100%",
                    justifyContent: "center",
                    background: showRecolored ? "#d4a57420" : "transparent",
                    color: showRecolored ? "#d4a574" : "#c9bba3",
                  }}
                >
                  {showRecolored ? <Eye size={13} /> : <EyeOff size={13} />}
                  {showRecolored ? "Hide" : "Show"} recolored previews
                </button>
              </div>
            </div>

            <button
              onClick={runAll}
              disabled={!imageData || running}
              style={{
                background: running ? "#3a2f25" : "#d4a574",
                color: running ? "#8a7d6a" : "#0a0807",
                border: "none",
                padding: "18px 24px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 16,
                fontWeight: 600,
                cursor: running ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                letterSpacing: "0.02em",
                transition: "background 0.2s",
              }}
            >
              {running ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Running {progress?.name}…
                </>
              ) : (
                <>
                  <Play size={16} /> Run all eight algorithms
                </>
              )}
            </button>
            {progress && (
              <div style={{ marginTop: 12 }}>
                <div className="mono" style={{ fontSize: 10, color: "#8a7d6a", marginBottom: 4 }}>
                  {progress.current + 1} / {progress.total}
                </div>
                <div style={{ height: 2, background: "#2a2420" }}>
                  <div style={{
                    height: "100%",
                    width: `${(progress.current / progress.total) * 100}%`,
                    background: "#d4a574", transition: "width 0.3s",
                  }} />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---------- RESULTS GRID ---------- */}
        <section>
          <div style={{
            display: "flex", alignItems: "baseline", gap: 16, marginBottom: 24, flexWrap: "wrap",
          }}>
            <h2 className="display" style={{ fontSize: 40, margin: 0 }}>
              Results
            </h2>
            <div className="mono" style={{ fontSize: 11, color: "#8a7d6a", letterSpacing: "0.15em" }}>
              {Object.keys(results).length} / {ALGORITHMS.length} computed
            </div>
            {ranking.fastest && (
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#c9bba3", marginLeft: "auto" }}>
                <Badge label="fastest" value={ALGORITHMS.find(a => a.id === ranking.fastest)?.name} color="#7eb89f" />
                <Badge label="lowest MSE" value={ALGORITHMS.find(a => a.id === ranking.bestQuality)?.name} color="#d4a574" />
                <Badge label="most diverse" value={ALGORITHMS.find(a => a.id === ranking.mostDiverse)?.name} color="#b87fa8" />
              </div>
            )}
          </div>

          <div className="ridge" style={{ marginBottom: 24 }} />

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
            gap: 20,
          }}>
            {ALGORITHMS.map((algo) => {
              const r = results[algo.id];
              return (
                <AlgorithmCard
                  key={algo.id}
                  algo={algo}
                  result={r}
                  imageSrc={imageSrc}
                  imageData={imageData}
                  showRecolored={showRecolored}
                  onCopyHex={copyHex}
                  copiedHex={copiedHex}
                  isFastest={ranking.fastest === algo.id}
                  isBestQuality={ranking.bestQuality === algo.id}
                  isMostDiverse={ranking.mostDiverse === algo.id}
                  k={k}
                />
              );
            })}
          </div>
        </section>

        {/* ---------- FOOTER ---------- */}
        <footer style={{
          marginTop: 80, paddingTop: 24, borderTop: "1px solid #2a2420",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        }}>
          <div className="mono" style={{ fontSize: 11, color: "#5a5048" }}>
            Wall-clock timing via <code>performance.now()</code> · MSE sampled to ~30k pixels · all algorithms run on main thread
          </div>
          <div className="mono" style={{ fontSize: 11, color: "#5a5048" }}>
            ⌘V to paste · drop to upload
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type="range"] { -webkit-appearance: none; appearance: none; background: #2a2420; height: 4px; border-radius: 0; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; background: #d4a574;
          cursor: pointer; border-radius: 50%; border: 2px solid #0a0807;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px; height: 16px; background: #d4a574;
          cursor: pointer; border-radius: 50%; border: 2px solid #0a0807;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const btnSecondary = {
  background: "transparent",
  border: "1px solid #2a2420",
  color: "#c9bba3",
  padding: "8px 14px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.15s",
  letterSpacing: "0.02em",
};

function Badge({ label, value, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="mono" style={{
        fontSize: 9, color: "#5a5048", letterSpacing: "0.15em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{ color, fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

function AlgorithmCard({
  algo, result, imageSrc, imageData, showRecolored, onCopyHex, copiedHex,
  isFastest, isBestQuality, isMostDiverse, k,
}) {
  const hasResult = result && !result.error;
  const palette = hasResult ? sortByLuma(result.palette) : [];

  return (
    <div style={{
      background: "#100c09",
      border: "1px solid #2a2420",
      padding: 20,
      position: "relative",
      display: "flex",
      flexDirection: "column",
      minHeight: 280,
    }}>
      {/* algorithm meta */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 4, gap: 12,
      }}>
        <h3 className="display" style={{ fontSize: 28, margin: 0, lineHeight: 1 }}>
          {algo.name}
        </h3>
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          {algo.speedTier && (
            <span
              className="mono"
              title={`Speed tier — see ALGORITHM REGISTRY comment for measured benchmark`}
              style={{
                fontSize: 9, letterSpacing: "0.1em",
                color: TIER_COLOR[algo.speedTier] || "#5a5048",
              }}
            >
              {algo.speedTier.toUpperCase()}
            </span>
          )}
          <span className="mono" style={{
            fontSize: 10, color: "#5a5048", letterSpacing: "0.1em",
          }}>
            {algo.family.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "#8a7d6a", marginBottom: 10 }}>
        {algo.author} · {algo.year}
      </div>
      <p style={{
        fontSize: 12, color: "#c9bba3", lineHeight: 1.45, margin: "0 0 16px",
        minHeight: 50,
      }}>
        {algo.blurb}
      </p>

      {/* palette */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end",
      }}>
        {hasResult ? (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(palette.length, k)}, 1fr)`,
              gap: 0,
              marginBottom: 12,
              height: 56,
            }}>
              {palette.map((c, i) => {
                const hex = rgbToHex(c);
                const isCopied = copiedHex === hex;
                const isLight = rgbLuma(c) > 140;
                return (
                  <button
                    key={i}
                    onClick={() => onCopyHex(hex)}
                    title={hex}
                    style={{
                      background: hex,
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      position: "relative",
                      transition: "transform 0.15s",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "scaleY(1.15)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "scaleY(1)"}
                  >
                    {isCopied && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: isLight ? "#0a0807" : "#f4ede0", fontSize: 10,
                      }}>
                        <Check size={12} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* hex codes */}
            <div className="mono" style={{
              fontSize: 9, color: "#5a5048", marginBottom: 16,
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(palette.length, 4)}, 1fr)`,
              gap: 2, lineHeight: 1.4,
            }}>
              {palette.slice(0, 8).map((c, i) => (
                <span key={i}>{rgbToHex(c)}</span>
              ))}
            </div>

            {/* recolored preview */}
            {showRecolored && imageData && (
              <RecoloredCanvas imageData={imageData} palette={result.palette} />
            )}

            {/* metrics */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12,
              paddingTop: 12, borderTop: "1px solid #2a2420",
            }}>
              <Metric
                label="time"
                value={`${result.elapsed.toFixed(1)}ms`}
                highlight={isFastest}
              />
              <Metric
                label="MSE"
                value={result.mse < 10000 ? result.mse.toFixed(0) : (result.mse / 1000).toFixed(1) + "k"}
                highlight={isBestQuality}
              />
              <Metric
                label="diversity"
                value={result.diversity.toFixed(0)}
                highlight={isMostDiverse}
              />
            </div>
          </>
        ) : result?.error ? (
          <div style={{
            color: "#b85a5a", padding: 16, fontSize: 12,
            background: "#1a0a0a", border: "1px solid #3a1818",
          }}>
            Error: {result.error}
          </div>
        ) : (
          <div style={{
            height: 56, background: "repeating-linear-gradient(45deg, #15110d, #15110d 4px, #0a0807 4px, #0a0807 8px)",
            marginBottom: 12,
          }} />
        )}
      </div>

      {/* corner ribbons for winners */}
      {(isFastest || isBestQuality || isMostDiverse) && (
        <div style={{
          position: "absolute", top: 0, right: 0,
          display: "flex", flexDirection: "column", alignItems: "flex-end",
        }}>
          {isFastest && <Ribbon color="#7eb89f">FASTEST</Ribbon>}
          {isBestQuality && <Ribbon color="#d4a574">BEST MSE</Ribbon>}
          {isMostDiverse && <Ribbon color="#b87fa8">DIVERSE</Ribbon>}
        </div>
      )}
    </div>
  );
}

function Ribbon({ color, children }) {
  return (
    <div className="mono" style={{
      background: color, color: "#0a0807",
      padding: "3px 8px", fontSize: 9, letterSpacing: "0.1em", fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

function Metric({ label, value, highlight }) {
  return (
    <div>
      <div className="mono" style={{
        fontSize: 9, color: "#5a5048", letterSpacing: "0.15em",
        textTransform: "uppercase", marginBottom: 4,
      }}>
        {label}
      </div>
      <div className="mono" style={{
        fontSize: 14, fontWeight: 500,
        color: highlight ? "#d4a574" : "#f4ede0",
      }}>
        {value}
      </div>
    </div>
  );
}

function RecoloredCanvas({ imageData, palette }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!canvasRef.current || !palette.length) return;
    const c = canvasRef.current;
    c.width = imageData.width;
    c.height = imageData.height;
    const ctx = c.getContext("2d");
    const out = ctx.createImageData(imageData.width, imageData.height);
    const src = imageData.data;
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2];
      let best = 0, bestD = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const [pr, pg, pb] = palette[j];
        const dr = r - pr, dg = g - pg, db = b - pb;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; best = j; }
      }
      const [pr, pg, pb] = palette[best];
      out.data[i] = pr; out.data[i + 1] = pg; out.data[i + 2] = pb;
      out.data[i + 3] = src[i + 3];
    }
    ctx.putImageData(out, 0, 0);
  }, [imageData, palette]);
  return (
    <div style={{ marginBottom: 16, background: "#070504", padding: 4 }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "auto", imageRendering: "pixelated", display: "block" }}
      />
    </div>
  );
}
