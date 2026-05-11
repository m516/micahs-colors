import { clamp, safeMod, generateId } from './math';
import { ColorSpaceConverter, SPACE_SCALES } from './color';
// Side-effect import: mixbox is a UMD module that attaches itself to
// window.mixbox when loaded. The mixbox-based dithering modes read it via
// window.mixbox below, so the binding is intentionally unused — but the
// import must stay or the bundler will tree-shake it out.
import './mixbox';

// Error-diffusion kernels. Historical context:
//   The pseudo-random-noise dithering idea originates with Roberts, L. G., "Picture Coding Using
//   Pseudo-Random Noise", IRE Trans. Information Theory IT-8(2):145-154, 1962 (his 1961 MIT MS thesis).
//   The 2-D error-diffusion paradigm was introduced concurrently in 1976 by Floyd & Steinberg
//   (this file) and by Jarvis, Judice & Ninke ("A survey of techniques for the display of continuous
//   tone pictures on bilevel displays", Computer Graphics and Image Processing 5:13-40, 1976,
//   DOI: 10.1016/S0146-664X(76)80003-2). JJN is the immediate ancestor of Stucki and Burkes.
export const ERROR_KERNELS = {
    // Floyd, R.W. & Steinberg, L., "An adaptive algorithm for spatial grey scale",
    // Proc. Society for Information Display 17(2):75-77, 1976. Coefficients sum to 1.
    'floyd':       [ {x:1,y:0,f:7/16}, {x:-1,y:1,f:3/16}, {x:0,y:1,f:5/16}, {x:1,y:1,f:1/16} ],
    // Atkinson, B. (developed 1983, shipped 1984). Used in Apple QuickDraw / MacPaint / HyperCard.
    // No formal publication. The 6 cells deliberately sum to 6/8 = 3/4 -- the missing 1/4 is the
    // signature attenuation that keeps highlights and shadows pure on a 1-bit display.
    'atkinson':    [ {x:1,y:0,f:1/8}, {x:2,y:0,f:1/8}, {x:-1,y:1,f:1/8}, {x:0,y:1,f:1/8}, {x:1,y:1,f:1/8}, {x:0,y:2,f:1/8} ],
    // Sierra, F., posted to the CompuServe Computer Art Forum, 1989. No formal publication;
    // catalogued by Crocker/Boulay/Morra in DHALF.TXT (1991) and by Helland (2012).
    'sierra':      [ {x:1,y:0,f:5/32},{x:2,y:0,f:3/32},{x:-2,y:1,f:2/32},{x:-1,y:1,f:4/32},{x:0,y:1,f:5/32},{x:1,y:1,f:4/32},{x:2,y:1,f:2/32},{x:-1,y:2,f:2/32},{x:0,y:2,f:3/32},{x:1,y:2,f:2/32} ],
    // Sierra, F. ("Sierra-2-4A" / "Filter Lite"), 1990. Same source family.
    'sierra-lite': [ {x:1,y:0,f:2/4}, {x:-1,y:1,f:1/4}, {x:0,y:1,f:1/4} ],
    // Stucki, P., "MECCA -- A multiple-error correcting computation algorithm for bilevel image
    // hardcopy reproduction", IBM Research Report RZ 1060, IBM Zurich, 1981. Refines JJN with
    // power-of-two coefficients (the divisor 42 still requires real division, but every weight
    // reduces to a single bit-shift once 1/42 is computed).
    'stucki':      [ {x:1,y:0,f:8/42},{x:2,y:0,f:4/42},{x:-2,y:1,f:2/42},{x:-1,y:1,f:4/42},{x:0,y:1,f:8/42},{x:1,y:1,f:4/42},{x:2,y:1,f:2/42},{x:-2,y:2,f:1/42},{x:-1,y:2,f:2/42},{x:0,y:2,f:4/42},{x:1,y:2,f:2/42},{x:2,y:2,f:1/42} ],
    // Burkes, D., "LaserWave" newsletter, 1988. Stucki with the bottom row removed; the resulting
    // divisor 32 = 2^5 lets the entire kernel reduce to bit-shifts.
    'burkes':      [ {x:1,y:0,f:8/32},{x:2,y:0,f:4/32},{x:-2,y:1,f:2/32},{x:-1,y:1,f:4/32},{x:0,y:1,f:8/32},{x:1,y:1,f:4/32},{x:2,y:1,f:2/32} ]
};

// Ostromoukhov, V., "A simple and efficient error-diffusion algorithm",
// Proc. SIGGRAPH 2001, pp. 567-572. DOI: 10.1145/383259.383326.
//
// Three-cell kernel at offsets (x=+1,y=0), (x=-1,y=+1), (x=0,y=+1). For every input
// intensity level 0..255, the three integer weights and their sum are looked up in a
// precomputed table. The table below is a verbatim transcription of Appendix I of the
// 2001 paper (entries 0..127); entries 128..255 are obtained by symmetry, D[i] = D[255-i].
//
// IMPORTANT: This algorithm is calibrated for a serpentine raster (alternating L-to-R
// and R-to-L). The renderer enforces serpentine traversal whenever this method is selected.
export const OSTROMOUKHOV_TABLE = (() => {
    // Half-range [0..127] from Ostromoukhov 2001, Appendix I. Triplets are (A_R, A_BL, A_B):
    //   d_R  = A_R  / (A_R + A_BL + A_B)   -- east  neighbour, offset (+1,  0)
    //   d_BL = A_BL / (A_R + A_BL + A_B)   -- below-left,      offset (-1, +1)
    //   d_B  = A_B  / (A_R + A_BL + A_B)   -- below,           offset ( 0, +1)
    const half = [
        [13,0,5],[13,0,5],[21,0,10],[7,0,4],[8,0,5],[47,3,28],[23,3,13],[15,3,8],
        [22,6,11],[43,15,20],[7,3,3],[501,224,211],[249,116,103],[165,80,67],[123,62,49],[489,256,191],
        [81,44,31],[483,272,181],[60,35,22],[53,32,19],[237,148,83],[471,304,161],[3,2,1],[481,314,185],
        [354,226,155],[1389,866,685],[227,138,125],[267,158,163],[327,188,220],[61,34,45],[627,338,505],[1227,638,1075],
        [20,10,19],[1937,1000,1767],[977,520,855],[657,360,551],[71,40,57],[2005,1160,1539],[337,200,247],[2039,1240,1425],
        [257,160,171],[691,440,437],[1045,680,627],[301,200,171],[177,120,95],[2141,1480,1083],[1079,760,513],[725,520,323],
        [137,100,57],[2209,1640,855],[53,40,19],[2243,1720,741],[565,440,171],[759,600,209],[1147,920,285],[2311,1880,513],
        [97,80,19],[335,280,57],[1181,1000,171],[793,680,95],[599,520,57],[2413,2120,171],[405,360,19],[2447,2200,57],
        [11,10,0],[158,151,3],[178,179,7],[1030,1091,63],[248,277,21],[318,375,35],[458,571,63],[878,1159,147],
        [5,7,1],[172,181,37],[97,76,22],[72,41,17],[119,47,29],[4,1,1],[4,1,1],[4,1,1],
        [4,1,1],[4,1,1],[4,1,1],[4,1,1],[4,1,1],[4,1,1],[65,18,17],[95,29,26],
        [185,62,53],[30,11,9],[35,14,11],[85,37,28],[55,26,19],[80,41,29],[155,86,59],[5,3,2],
        [5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],[5,3,2],
        [5,3,2],[5,3,2],[5,3,2],[5,3,2],[305,176,119],[155,86,59],[105,56,39],[80,41,29],
        [65,32,23],[55,26,19],[335,152,113],[85,37,28],[115,48,37],[35,14,11],[355,136,109],[30,11,9],
        [365,128,107],[185,62,53],[25,8,7],[95,29,26],[385,112,103],[65,18,17],[395,104,101],[4,1,1],
    ];
    // Pre-normalize into 256 rows of {f_R, f_BL, f_B} (floats summing to 1) for fast lookup.
    const tbl = new Array(256);
    for (let i = 0; i < 256; i++) {
        const [a, b, c] = i < 128 ? half[i] : half[255 - i];
        const m = a + b + c;
        tbl[i] = { f_R: a / m, f_BL: b / m, f_B: c / m };
    }
    return tbl;
})();

// Three-cell Ostromoukhov kernel for a given input intensity (0..255).
// The renderer iterates this exactly like the static kernels in ERROR_KERNELS.
export const getOstromoukhovKernel = (intensity) => {
    const idx = clamp(Math.round(intensity), 0, 255);
    const w = OSTROMOUKHOV_TABLE[idx];
    return [
        { x:  1, y: 0, f: w.f_R  },   // east
        { x: -1, y: 1, f: w.f_BL },   // below-left
        { x:  0, y: 1, f: w.f_B  },   // below
    ];
};

// ==========================================
// 3. DITHERING & PALETTE ALGORITHMS
// ==========================================

export const generateBayerMatrix = (n) => {
    if (n === 2) return [[0, 2], [3, 1]];
    const prev = generateBayerMatrix(n / 2);
    const size = prev.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const val = prev[y][x];
            matrix[y][x] = 4 * val; matrix[y][x + size] = 4 * val + 2;      
            matrix[y + size][x] = 4 * val + 3; matrix[y + size][x + size] = 4 * val + 1; 
        }
    }
    return matrix;
};

export const generateHalftoneMatrix = (n) => {
    const matrix = Array(n).fill().map(() => Array(n).fill(0));
    const center = (n - 1) / 2.0;
    const points = [];
    for(let y=0; y<n; y++) for(let x=0; x<n; x++) points.push({x, y, d: Math.pow(x-center, 2) + Math.pow(y-center, 2)});
    points.sort((a,b) => a.d - b.d);
    points.forEach((p, i) => matrix[p.y][p.x] = i);
    return matrix;
};

export const BAYER_MAPS = { 2: generateBayerMatrix(2), 4: generateBayerMatrix(4), 8: generateBayerMatrix(8), 16: generateBayerMatrix(16), 32: generateBayerMatrix(32) };
export const HALFTONE_MAPS = { 2: generateHalftoneMatrix(2), 4: generateHalftoneMatrix(4), 8: generateHalftoneMatrix(8), 16: generateHalftoneMatrix(16), 32: generateHalftoneMatrix(32) };

// Blue-noise threshold mask via the void-and-cluster algorithm.
//   Ulichney, R. A., "The void-and-cluster method for dither array generation",
//   Proc. SPIE 1913, Human Vision, Visual Processing, and Digital Display IV,
//   pp. 332-343, 1993. DOI: 10.1117/12.152707.
//
// The mask returned has the same SHAPE as the Bayer matrices in this file (a
// 2-D array of integers in [0, N*N - 1]) so it drops into the existing pattern
// dispatcher without further changes. Generation is deferred to the first call;
// a single 32x32 mask (~50ms in JS) is generated once and cached.
export const generateVoidAndClusterMask = (size) => {
    const N = size * size;
    const sigma = 1.9;                     // Ulichney's recommended Gaussian sigma.
    const sigmaSq2 = 2 * sigma * sigma;
    const filterRadius = Math.ceil(3 * sigma);

    const energy = new Float32Array(N);    // Gaussian-filtered density of "1" pixels.
    const pattern = new Uint8Array(N);     // Working binary pattern, 1 = on.
    const ranks = new Int32Array(N);       // Final rank assigned to each pixel.

    const wrap = (a, b) => ((a % b) + b) % b;
    const idx = (x, y) => wrap(y, size) * size + wrap(x, size);

    // Toroidal Gaussian splat: add (sign=+1) or remove (sign=-1) one point's contribution.
    const splat = (px, py, sign) => {
        for (let dy = -filterRadius; dy <= filterRadius; dy++) {
            for (let dx = -filterRadius; dx <= filterRadius; dx++) {
                energy[idx(px + dx, py + dy)] += sign * Math.exp(-(dx * dx + dy * dy) / sigmaSq2);
            }
        }
    };

    // Find tightest cluster (highest-energy ON pixel).
    const findTightestCluster = () => {
        let best = -1, bestE = -Infinity;
        for (let i = 0; i < N; i++) if (pattern[i] && energy[i] > bestE) { bestE = energy[i]; best = i; }
        return best;
    };
    // Find largest void (lowest-energy OFF pixel).
    const findLargestVoid = () => {
        let best = -1, bestE = Infinity;
        for (let i = 0; i < N; i++) if (!pattern[i] && energy[i] < bestE) { bestE = energy[i]; best = i; }
        return best;
    };

    // Step 0: deterministic seed pattern (~10% density) using a small LCG so the mask is reproducible.
    let lcg = 0xBEEF1234 >>> 0;
    const rand = () => { lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0; return lcg / 0x1_0000_0000; };
    const initialOnes = Math.max(1, Math.floor(N / 10));
    let placed = 0;
    while (placed < initialOnes) {
        const i = Math.floor(rand() * N);
        if (!pattern[i]) { pattern[i] = 1; splat(i % size, Math.floor(i / size), +1); placed++; }
    }

    // Step 1 (initial pattern): swap tightest cluster <-> largest void until the swap becomes a no-op.
    while (true) {
        const tight = findTightestCluster();
        pattern[tight] = 0; splat(tight % size, Math.floor(tight / size), -1);
        const voidI = findLargestVoid();
        if (voidI === tight) {
            pattern[tight] = 1; splat(tight % size, Math.floor(tight / size), +1);
            break;
        }
        pattern[voidI] = 1; splat(voidI % size, Math.floor(voidI / size), +1);
    }

    // Snapshot the relaxed prototype before phases mutate `pattern`.
    const prototype = new Uint8Array(pattern);

    // Phase I: rank ones, ones-1, ..., 0 by repeatedly removing the tightest cluster.
    for (let rank = placed - 1; rank >= 0; rank--) {
        const tight = findTightestCluster();
        ranks[tight] = rank;
        pattern[tight] = 0;
        splat(tight % size, Math.floor(tight / size), -1);
    }

    // Phase II: restore the prototype and rank ones, ones+1, ..., N/2-1 by filling largest voids.
    pattern.set(prototype); energy.fill(0);
    for (let i = 0; i < N; i++) if (pattern[i]) splat(i % size, Math.floor(i / size), +1);
    const half = Math.floor(N / 2);
    for (let rank = placed; rank < half; rank++) {
        const voidI = findLargestVoid();
        ranks[voidI] = rank;
        pattern[voidI] = 1;
        splat(voidI % size, Math.floor(voidI / size), +1);
    }

    // Phase III: invert the pattern; "tightest cluster of 0s" = "largest void of 1s" in the dual.
    for (let i = 0; i < N; i++) pattern[i] = 1 - pattern[i];
    energy.fill(0);
    for (let i = 0; i < N; i++) if (pattern[i]) splat(i % size, Math.floor(i / size), +1);
    for (let rank = half; rank < N; rank++) {
        const tight = findTightestCluster();
        ranks[tight] = rank;
        pattern[tight] = 0;
        splat(tight % size, Math.floor(tight / size), -1);
    }

    // Reshape flat ranks into the 2-D matrix shape used elsewhere.
    const matrix = Array(size).fill().map(() => Array(size).fill(0));
    for (let i = 0; i < N; i++) matrix[Math.floor(i / size)][i % size] = ranks[i];
    return matrix;
};

// Lazy cache: blue-noise generation is ~50ms for 32x32, so we only build it on first use.
export const BLUE_NOISE_MAPS = {};
export const getBlueNoiseMap = (size) => {
    if (!BLUE_NOISE_MAPS[size]) BLUE_NOISE_MAPS[size] = generateVoidAndClusterMask(size);
    return BLUE_NOISE_MAPS[size];
};

// Pre-existing bug fix: emit at the CENTER of each leaf cell, not its corner.
// With corner emission, multiple recursion branches collapse to the same integer
// coordinate after Math.floor, while other in-bounds cells are never reached.
// Empirically this left ~20% of pixels unvisited on a 64x64 grid, which then
// retained their pre-dither source colours -- visible as "invalid" pixels in the
// Riemersma output. Center emission is the textbook formulation and gives 100%
// coverage on any power-of-two grid (and contiguous coverage on the in-bounds
// subset of non-power-of-two grids).
export const generateHilbertCurve = (width, height) => {
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(width, height))));
    const points = [];
    const hilbert = (x, y, xi, xj, yi, yj, n) => {
        if (n <= 0) {
            const px = Math.floor(x + (xi + yi) / 2);
            const py = Math.floor(y + (xj + yj) / 2);
            if (px >= 0 && px < width && py >= 0 && py < height) points.push({x: px, y: py});
        } else {
            hilbert(x,           y,           yi/2, yj/2, xi/2, xj/2, n-1);
            hilbert(x+xi/2,      y+xj/2,      xi/2, xj/2, yi/2, yj/2, n-1);
            hilbert(x+xi/2+yi/2, y+xj/2+yj/2, xi/2, xj/2, yi/2, yj/2, n-1);
            hilbert(x+xi/2+yi,   y+xj/2+yj,  -yi/2,-yj/2,-xi/2,-xj/2, n-1);
        }
    };
    hilbert(0, 0, size, 0, 0, size, Math.log2(size));
    return points;
};

export const extractPaletteHull = (pixels, k, settings, lockedColors = []) => {
  if (lockedColors.length >= k) return lockedColors.slice(0, k).map(c => ({ ...c, isNew: false }));
  if (pixels.length === 0) return lockedColors;
  const { colorSpace, contrastAnchoring, genSeed, manualWeights } = settings;
  const Converter = ColorSpaceConverter[colorSpace];
  const weights = (colorSpace === 'srgb' || colorSpace === 'linear') ? [manualWeights.r, manualWeights.g, manualWeights.b] : [1, 1, 1];
  
  const colorCounts = new Map();
  const step = 4 * 2; 
  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue;
    const key = ((pixels[i] & 0xF8) << 16) | ((pixels[i+1] & 0xF8) << 8) | (pixels[i+2] & 0xF8);
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  }
  let samples = [];
  const threshold = Math.max(1, pixels.length / (step * 5000)); 
  for (let [key, count] of colorCounts) {
    if (count >= threshold) {
      const r = (key >> 16) & 0xFF, g = (key >> 8) & 0xFF, b = key & 0xFF;
      samples.push({ r, g, b, transformed: Converter.to(r, g, b) });
    }
  }
  const numVectors = 500; const candidateList = []; const candidatesSet = new Set();
  const phi = Math.PI * (3 - Math.sqrt(5)); 
  for (let i = 0; i < numVectors; i++) {
    const y = 1 - (i / (numVectors - 1)) * 2, radius = Math.sqrt(1 - y * y);
    const theta = phi * i + (genSeed * 1000); 
    const dx = Math.cos(theta) * radius, dy = y, dz = Math.sin(theta) * radius;
    let maxDot = -Infinity, bestIdx = -1;
    for (let j = 0; j < samples.length; j++) {
        const [v0, v1, v2] = samples[j].transformed;
        const dot = v0 * dx + v1 * dy + v2 * dz;
        if (dot > maxDot) { maxDot = dot; bestIdx = j; }
    }
    if (bestIdx !== -1 && !candidatesSet.has(bestIdx)) { candidatesSet.add(bestIdx); candidateList.push(samples[bestIdx]); }
  }
  
  let finalColors = lockedColors.map(c => ({...c})); 
  finalColors.forEach(c => { c.transformed = Converter.to(c.r, c.g, c.b); });
  
  if (contrastAnchoring && finalColors.length < k && candidateList.length > 0) {
      let minL = Infinity, maxL = -Infinity, minIdx = -1, maxIdx = -1;
      candidateList.forEach((s, idx) => {
         const l = s.transformed[0];
         if (l < minL) { minL = l; minIdx = idx; }
         if (l > maxL) { maxL = l; maxIdx = idx; }
      });
      [minIdx, maxIdx].forEach(idx => {
          if (idx !== -1 && finalColors.length < k) {
              const ex = candidateList[idx];
              if (!finalColors.some(p => {
                  const d0 = p.transformed[0] - ex.transformed[0];
                  const d1 = p.transformed[1] - ex.transformed[1];
                  const d2 = p.transformed[2] - ex.transformed[2];
                  return (weights[0]*d0*d0 + weights[1]*d1*d1 + weights[2]*d2*d2) < 2;
              })) {
                  finalColors.push({...ex, displayR: ex.r, displayG: ex.g, displayB: ex.b, offsetX: 0, offsetY: 0, locked: false, isNew: true, id: generateId()});
              }
          }
      });
  }
  let sourceArray = candidateList.length > (k - finalColors.length) ? candidateList : samples;
  while (finalColors.length < k) {
      let maxDist = -1, farthestIdx = -1;
      for (let i = 0; i < sourceArray.length; i++) {
          let minDist = Infinity;
          for (const p of finalColors) {
              const d0 = sourceArray[i].transformed[0] - p.transformed[0];
              const d1 = sourceArray[i].transformed[1] - p.transformed[1];
              const d2 = sourceArray[i].transformed[2] - p.transformed[2];
              const d = weights[0]*d0*d0 + weights[1]*d1*d1 + weights[2]*d2*d2;
              if (d < minDist) minDist = d;
          }
          if (minDist > maxDist) { maxDist = minDist; farthestIdx = i; }
      }
      if (farthestIdx !== -1) {
          const s = sourceArray[farthestIdx];
          finalColors.push({ r: s.r, g: s.g, b: s.b, displayR: s.r, displayG: s.g, displayB: s.b, transformed: s.transformed, offsetX: 0, offsetY: 0, locked: false, isNew: true, id: generateId() });
      } else break;
  }
  return finalColors.map((c, i) => ({ ...c, impactIndex: i }));
};

export const findNearestColorEuclidean = (vArr, palette) => {
    let minDist = Infinity; let nearest = palette[0]; 
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i]; 
        let d = 0;
        for (let k = 0; k < vArr.length; k++) d += (vArr[k] - p.transformed[k]) * (vArr[k] - p.transformed[k]);
        if (d < minDist) { minDist = d; nearest = p; }
    }
    return nearest;
};

export const findNNearestColorsEuclidean = (vArr, palette, n) => {
    const distances = palette.map(p => {
        let d = 0;
        for (let k = 0; k < vArr.length; k++) d += (vArr[k] - p.transformed[k]) * (vArr[k] - p.transformed[k]);
        return { color: p, dist: d };
    });
    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, n);
};

export const sortPalette = (palette, mode) => {
    const sorted = [...palette];
    if (mode === 'luminance') {
        sorted.sort((c1, c2) => {
            const l1 = ColorSpaceConverter.oklab.to(c1.displayR, c1.displayG, c1.displayB)[0];
            const l2 = ColorSpaceConverter.oklab.to(c2.displayR, c2.displayG, c2.displayB)[0];
            return l1 - l2;
        });
    } else if (mode === 'impact') {
        sorted.sort((c1, c2) => (c1.impactIndex || 0) - (c2.impactIndex || 0));
    }
    return sorted;
};

// Build a GIF-ready palette (up to maxColors RGB triplets) from a rendered
// RGBA pixel buffer. For dither output this is a no-op equivalent — every
// pixel already is a palette entry, so the unique-color pass returns the
// user's palette exactly. For mixing modes (linear-projection, paper-*)
// the renderer produces thousands of interpolated colors; if their unique
// count exceeds maxColors we median-cut down to maxColors so the GIF can
// represent the gradient instead of clipping every interpolation back to
// the closest user-palette color.
//
// Fully-transparent pixels are excluded. Returns an array of [r, g, b]
// triplets, length ≤ maxColors.
export const buildGifPalette = (rgba, maxColors = 255) => {
    const unique = new Set();
    for (let p = 0; p < rgba.length; p += 4) {
        if (rgba[p + 3] < 128) continue;
        unique.add((rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2]);
        if (unique.size > maxColors) break; // early-out, will median-cut below
    }
    if (unique.size <= maxColors) {
        return [...unique].map(rgb => [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]);
    }

    // Median-cut quantization. Collect all opaque pixels into a single box,
    // then repeatedly split the box with the longest RGB-axis range at its
    // median, until we have maxColors boxes. Each box's mean is one palette
    // entry. O(P log P) per split via the per-axis sort; fine for the frame
    // sizes we encode here.
    const pixels = [];
    for (let p = 0; p < rgba.length; p += 4) {
        if (rgba[p + 3] >= 128) pixels.push([rgba[p], rgba[p + 1], rgba[p + 2]]);
    }
    let boxes = [pixels];
    while (boxes.length < maxColors) {
        let bestIdx = -1, bestRange = -1, bestAxis = 0;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].length < 2) continue;
            let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
            for (const px of boxes[i]) {
                if (px[0] < minR) minR = px[0]; if (px[0] > maxR) maxR = px[0];
                if (px[1] < minG) minG = px[1]; if (px[1] > maxG) maxG = px[1];
                if (px[2] < minB) minB = px[2]; if (px[2] > maxB) maxB = px[2];
            }
            const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
            const longest = Math.max(rR, rG, rB);
            if (longest > bestRange) {
                bestRange = longest;
                bestIdx = i;
                bestAxis = rR >= rG ? (rR >= rB ? 0 : 2) : (rG >= rB ? 1 : 2);
            }
        }
        if (bestIdx === -1 || bestRange === 0) break;
        const box = boxes[bestIdx];
        box.sort((a, b) => a[bestAxis] - b[bestAxis]);
        const mid = Math.floor(box.length / 2);
        boxes.splice(bestIdx, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => {
        let sr = 0, sg = 0, sb = 0;
        for (const px of box) { sr += px[0]; sg += px[1]; sb += px[2]; }
        const n = box.length;
        return [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)];
    });
};

// Pre-dither color transfer lives in lib/grade.js. Re-exported here for
// backwards compatibility with anything that still imports it from this
// module path.
export { applyColorTransfer, COLOR_TRANSFER_MODES } from './grade';
import { applyColorTransfer } from './grade';

export const renderDitheredImage = (canvas, sourceData, palette, settings) => {
    if (!canvas || !sourceData || !palette.length) return;
    const ctx = canvas.getContext('2d');
    canvas.width = sourceData.width; canvas.height = sourceData.height;

    const outputData = new ImageData(new Uint8ClampedArray(sourceData.pixels), sourceData.width, sourceData.height);
    const pixels = outputData.data;

    if (settings.colorTransfer && settings.colorTransfer !== 'none') applyColorTransfer(pixels, palette, settings.colorTransfer);

    // "None" mode: bypass all palette mapping/dithering and just emit the
    // (possibly color-transferred) source pixels. Useful for previewing the
    // color-transfer step in isolation.
    if (settings.ditherSubMethod === 'none') {
        ctx.putImageData(outputData, 0, 0);
        return;
    }

    const { width, height } = sourceData;

    const { colorSpace, manualWeights, ditherCategory, ditherSubMethod, dithering, bayerSize, serpentine, nCandidates, distanceExponent, riemersmaHistory, ditherSeed, matchMethod } = settings;
    const Converter = ColorSpaceConverter[colorSpace];
    
    const isBeerLambert = ditherSubMethod === 'paper-beer-lambert';
    const isMixbox = ditherSubMethod === 'paper-mixbox';
    const mixboxReady = isMixbox && window.mixbox && window.mixbox.LATENT_SIZE;
    
    const D = mixboxReady ? window.mixbox.LATENT_SIZE : 3;
    
    // Scale Euclidean space internally based on manual weights to unify all distance math
    const w0 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.r) : 1;
    const w1 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.g) : 1;
    const w2 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.b) : 1;
    
    const workingPalette = palette.map(p => {
        if (isBeerLambert) {
            const [lr, lg, lb] = ColorSpaceConverter.linear.to(p.r, p.g, p.b);
            return { ...p, transformed: [-Math.log(Math.max(lr, 0.001)), -Math.log(Math.max(lg, 0.001)), -Math.log(Math.max(lb, 0.001))] };
        }
        if (mixboxReady) {
            return { ...p, transformed: window.mixbox.rgbToLatent([p.r, p.g, p.b]) };
        }
        const [v0, v1, v2] = Converter.to(p.r, p.g, p.b);
        return { ...p, transformed: [v0 * w0, v1 * w1, v2 * w2] };
    });

    if (mixboxReady) {
        // Appending White gives the solver a "Paper" base to bleed into when mixing shouldn't reach 100% saturation
        workingPalette.push({
            isWhitePaper: true,
            displayR: 255, displayG: 255, displayB: 255,
            transformed: window.mixbox.rgbToLatent([255, 255, 255])
        });
    }

    const wbuf = new Float32Array(width * height * D);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += D) {
        if (isBeerLambert) {
            const [lr, lg, lb] = ColorSpaceConverter.linear.to(pixels[i], pixels[i+1], pixels[i+2]);
            wbuf[j] = -Math.log(Math.max(lr, 0.001));
            wbuf[j+1] = -Math.log(Math.max(lg, 0.001));
            wbuf[j+2] = -Math.log(Math.max(lb, 0.001));
        } else if (mixboxReady) {
            const z = window.mixbox.rgbToLatent([pixels[i], pixels[i+1], pixels[i+2]]);
            for (let k = 0; k < D; k++) wbuf[j+k] = z[k];
        } else {
            const [v0, v1, v2] = Converter.to(pixels[i], pixels[i+1], pixels[i+2]);
            wbuf[j] = v0 * w0; wbuf[j+1] = v1 * w1; wbuf[j+2] = v2 * w2;
        }
    }

    const validNCandidates = Math.max(1, nCandidates || 4);
    const safeDistExp = distanceExponent || 2.0;

    const prng = (x, y, seed) => {
        let h = Math.sin(x * 12.9898 + y * 78.233 + (seed || 0) * 137.5) * 43758.5453;
        let val = h - Math.floor(h);
        return isNaN(val) ? 0 : val;
    };

    // Pre-allocated buffers for analytical projection solvers (Scales to any N Dimensions)
    const fwWeights = new Float32Array(workingPalette.length);
    const fwCurrentPos = new Float32Array(D);
    const fwError = new Float32Array(D);
    const fwDelta = new Float32Array(D);

    // Standard Frank-Wolfe for probability simplex (Linear Projection & Mixbox)
    const runFW = (vArr) => {
        const P = workingPalette.length;
        fwWeights.fill(0);
        
        let bestStartIdx = 0, minDist = Infinity;
        for (let p = 0; p < P; p++) {
            const c = workingPalette[p].transformed;
            let d = 0;
            for (let k = 0; k < D; k++) d += (c[k] - vArr[k]) * (c[k] - vArr[k]);
            if (d < minDist) { minDist = d; bestStartIdx = p; }
        }

        fwWeights[bestStartIdx] = 1.0;
        const startC = workingPalette[bestStartIdx].transformed;
        for (let k = 0; k < D; k++) fwCurrentPos[k] = startC[k];

        for (let iter = 0; iter < 15; iter++) {
            for (let k = 0; k < D; k++) fwError[k] = fwCurrentPos[k] - vArr[k];

            let minDot = Infinity;
            let bestIdx = -1;

            for (let p = 0; p < P; p++) {
                const c = workingPalette[p].transformed;
                let dot = 0;
                for (let k = 0; k < D; k++) dot += c[k] * fwError[k];
                if (dot < minDot) { minDot = dot; bestIdx = p; }
            }

            let deltaSq = 0;
            const targetC = workingPalette[bestIdx].transformed;
            for (let k = 0; k < D; k++) {
                fwDelta[k] = targetC[k] - fwCurrentPos[k];
                deltaSq += fwDelta[k] * fwDelta[k];
            }

            if (deltaSq < 1e-6) break;

            let errDotDelta = 0;
            for (let k = 0; k < D; k++) errDotDelta += fwError[k] * fwDelta[k];

            const gamma = clamp(-errDotDelta / deltaSq, 0, 1);
            if (gamma === 0) break;

            for (let k = 0; k < D; k++) fwCurrentPos[k] += gamma * fwDelta[k];

            for (let p = 0; p < P; p++) fwWeights[p] *= (1 - gamma);
            fwWeights[bestIdx] += gamma;
        }
    };

    // Coordinate Descent for hypercube bounds 0.0 to 1.0 (Beer-Lambert Subtractive)
    const runBoundedCD = (vArr) => {
        const P = workingPalette.length;
        fwWeights.fill(0);
        for (let k = 0; k < D; k++) fwError[k] = -vArr[k]; 

        for (let iter = 0; iter < 20; iter++) {
            let maxChange = 0;
            for (let p = 0; p < P; p++) {
                const c = workingPalette[p].transformed;
                let AkSq = 0;
                for (let k = 0; k < D; k++) AkSq += c[k] * c[k];
                if (AkSq < 1e-6) continue;

                let dot = 0;
                for (let k = 0; k < D; k++) dot += fwError[k] * c[k];
                const delta = -dot / AkSq;

                const oldW = fwWeights[p];
                const newW = clamp(oldW + delta, 0, 1);
                const actualChange = newW - oldW;

                if (Math.abs(actualChange) > 1e-5) {
                    fwWeights[p] = newW;
                    for (let k = 0; k < D; k++) fwError[k] += actualChange * c[k];
                    if (Math.abs(actualChange) > maxChange) maxChange = Math.abs(actualChange);
                }
            }
            if (maxChange < 1e-4) break;
        }
    };

    const getNearestColor = (vArr) => {
        if (matchMethod === 'fw') {
            runFW(vArr);
            let maxW = -1;
            let bestC = workingPalette[0];
            for (let p = 0; p < workingPalette.length; p++) {
                if (fwWeights[p] > maxW && !workingPalette[p].isWhitePaper) {
                    maxW = fwWeights[p];
                    bestC = workingPalette[p];
                }
            }
            return bestC;
        }
        return findNearestColorEuclidean(vArr, workingPalette);
    };

    const getNNearestColors = (vArr, n) => {
        if (matchMethod === 'fw') {
            runFW(vArr);
            const candidates = workingPalette
                .filter(color => !color.isWhitePaper)
                .map((color, i) => {
                    const c = color.transformed;
                    let dist = 0;
                    for (let k = 0; k < D; k++) dist += (c[k] - vArr[k]) * (c[k] - vArr[k]);
                    return { color, weight: fwWeights[i], dist };
                });
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates.slice(0, n);
        }
        return findNNearestColorsEuclidean(vArr, workingPalette, n);
    };

    if (ditherCategory === 'analytical') {
        for (let i = 0, j = 0; i < pixels.length; i += 4, j += D) {
            if (pixels[i+3] < 128) continue;
            
            const vArr = wbuf.subarray(j, j + D);
            
            if (ditherSubMethod === 'linear-projection' || ditherSubMethod === 'paper-beer-lambert' || ditherSubMethod === 'paper-mixbox') {
                if (isBeerLambert) {
                    runBoundedCD(vArr);
                } else {
                    runFW(vArr);
                }
                
                if (isBeerLambert) {
                    let outR = 0, outG = 0, outB = 0;
                    for (let p = 0; p < workingPalette.length; p++) {
                        const w = fwWeights[p];
                        if (w > 0.001) {
                            const c = workingPalette[p].transformed;
                            outR += c[0] * w; outG += c[1] * w; outB += c[2] * w;
                        }
                    }
                    const [r, g, b] = ColorSpaceConverter.linear.from(Math.exp(-outR), Math.exp(-outG), Math.exp(-outB));
                    pixels[i] = clamp(r, 0, 255); pixels[i+1] = clamp(g, 0, 255); pixels[i+2] = clamp(b, 0, 255); 
                } else if (mixboxReady) {
                    let zMix = new Array(D).fill(0);
                    for (let p = 0; p < workingPalette.length; p++) {
                        const w = fwWeights[p];
                        if (w > 0.001) {
                            const c = workingPalette[p].transformed;
                            for (let k = 0; k < D; k++) zMix[k] += w * c[k];
                        }
                    }
                    const rgb = window.mixbox.latentToRgb(zMix);
                    pixels[i] = clamp(rgb[0], 0, 255); pixels[i+1] = clamp(rgb[1], 0, 255); pixels[i+2] = clamp(rgb[2], 0, 255);
                } else {
                    let outR = 0, outG = 0, outB = 0;
                    for (let p = 0; p < workingPalette.length; p++) {
                        const w = fwWeights[p];
                        if (w > 0.001) {
                            const c = workingPalette[p];
                            const [u0, u1, u2] = Converter.to(c.displayR, c.displayG, c.displayB);
                            outR += u0 * w; outG += u1 * w; outB += u2 * w;
                        }
                    }
                    const [r, g, b] = Converter.from(outR, outG, outB);
                    pixels[i] = clamp(r, 0, 255); pixels[i+1] = clamp(g, 0, 255); pixels[i+2] = clamp(b, 0, 255); 
                }
                continue; 
            }
            const nearest = getNearestColor(vArr);
            if (nearest) { pixels[i] = nearest.displayR; pixels[i+1] = nearest.displayG; pixels[i+2] = nearest.displayB; }
        }
    } else if (ditherCategory === 'flow') {
        const safeRiemersmaHistory = riemersmaHistory || 16;
        if (ditherSubMethod === 'riemersma') {
            // Riemersma, T., "A Balanced Dithering Technique", C/C++ Users Journal, December 1998.
            // (Also: https://www.compuphase.com/riemer.htm) Weights form a geometric series along
            // the queue: w_i = b^i with b = r^(1/(Q-1)), where r is the newest:oldest weight ratio
            // and Q is the queue length. Riemersma's recommended defaults are r = 16 and Q >= 16.
            // The previous code used `Math.exp(-i / (Q/4))`, which is also exponential but with a
            // hard-coded time constant unrelated to r. Fixed.
            const curve = generateHilbertCurve(width, height);
            const history = [];
            const Q = safeRiemersmaHistory;
            const r = settings.riemersmaRatio || 16;
            const b = Math.pow(r, 1 / Math.max(1, Q - 1));
            // history.unshift puts newest at index 0, so weights[0] (newest) = r, weights[Q-1] (oldest) = 1.
            const Hweights = Array.from({length: Q}, (_, i) => Math.pow(b, Q - 1 - i));
            const sumWeights = Hweights.reduce((a, w) => a + w, 0);

            for (const {x, y} of curve) {
                const idx = (y * width + x) * 4;
                const j = (y * width + x) * D;
                if (pixels[idx + 3] < 128) continue;

                let err0 = 0, err1 = 0, err2 = 0;
                for(let i=0; i<history.length; i++) {
                   err0 += history[i].e0 * (Hweights[i] / sumWeights); 
                   err1 += history[i].e1 * (Hweights[i] / sumWeights); 
                   err2 += history[i].e2 * (Hweights[i] / sumWeights);
                }

                const old0 = wbuf[j] + err0 * (dithering || 0.15);
                const old1 = wbuf[j+1] + err1 * (dithering || 0.15);
                const old2 = wbuf[j+2] + err2 * (dithering || 0.15);
                
                const [origR, origG, origB] = Converter.from(old0/w0, old1/w1, old2/w2);
                const cR = clamp(origR, 0, 255), cG = clamp(origG, 0, 255), cB = clamp(origB, 0, 255);
                const [t0, t1, t2] = Converter.to(cR, cG, cB);
                const safe0 = t0 * w0, safe1 = t1 * w1, safe2 = t2 * w2;
                
                const nearest = getNearestColor([safe0, safe1, safe2]);
                
                if (nearest) {
                    pixels[idx] = nearest.displayR; pixels[idx+1] = nearest.displayG; pixels[idx+2] = nearest.displayB;
                    history.unshift({ e0: safe0 - nearest.transformed[0], e1: safe1 - nearest.transformed[1], e2: safe2 - nearest.transformed[2] });
                }
                if (history.length > safeRiemersmaHistory) history.pop();
            }
        } else {
            // Ostromoukhov 2001 was calibrated for serpentine traversal -- enforce it for that
            // method regardless of the user's serpentine toggle.
            const useSerpentine = serpentine || ditherSubMethod === 'ostromoukhov';
            for (let y = 0; y < height; y++) {
                const isRev = useSerpentine && (y % 2 === 1);
                const startX = isRev ? width - 1 : 0; const endX = isRev ? -1 : width; const stepX = isRev ? -1 : 1;
                for (let x = startX; x !== endX; x += stepX) {
                    const idx = (y * width + x) * 4; 
                    const j = (y * width + x) * D;
                    if (pixels[idx + 3] < 128) continue;
                    
                    const old0 = wbuf[j], old1 = wbuf[j+1], old2 = wbuf[j+2];
                    
                    const [origR, origG, origB] = Converter.from(old0/w0, old1/w1, old2/w2);
                    const cR = clamp(origR, 0, 255);
                    const cG = clamp(origG, 0, 255);
                    const cB = clamp(origB, 0, 255);
                    
                    const [t0, t1, t2] = Converter.to(cR, cG, cB);
                    const safe0 = t0 * w0;
                    const safe1 = t1 * w1;
                    const safe2 = t2 * w2;
                    
                    const nearest = getNearestColor([safe0, safe1, safe2]);
                    if (nearest) {
                        pixels[idx] = nearest.displayR; pixels[idx+1] = nearest.displayG; pixels[idx+2] = nearest.displayB;
                        
                        const err0 = (safe0 - nearest.transformed[0]) * (dithering || 0.15);
                        const err1 = (safe1 - nearest.transformed[1]) * (dithering || 0.15);
                        const err2 = (safe2 - nearest.transformed[2]) * (dithering || 0.15);
                        
                        // Index Ostromoukhov's LUT by perceptual luminance (BT.709). The original
                        // paper is monochrome; for color the indexing channel is a design choice,
                        // and BT.709 luma matches the modern convention (see ITU-R BT.709-6).
                        const kernel = ditherSubMethod === 'ostromoukhov'
                            ? getOstromoukhovKernel(0.2126*cR + 0.7152*cG + 0.0722*cB)
                            : (ERROR_KERNELS[ditherSubMethod] || ERROR_KERNELS.floyd);
                        
                        kernel.forEach(k => {
                            const dx = isRev ? -k.x : k.x, dy = k.y; 
                            if (x + dx >= 0 && x + dx < width && y + dy < height) {
                                const nIdx = ((y + dy) * width + (x + dx)) * D;
                                wbuf[nIdx] += err0 * k.f; wbuf[nIdx+1] += err1 * k.f; wbuf[nIdx+2] += err2 * k.f;
                            }
                        });
                    }
                }
            }
        }
    } else if (ditherCategory === 'pattern') {
        // Choose the threshold matrix. Blue-noise mode uses a real void-and-cluster mask
        // (Ulichney 1993); halftone mode uses the radial spiral; otherwise Bayer 1973.
        // Previously this branch fell back to an 8x8 Bayer matrix when 'blue-noise' was
        // selected -- which is precisely NOT blue noise. Fixed.
        const reqSize = ditherSubMethod === 'blue-noise' ? 32 : (parseInt(bayerSize) || 8);
        const map = ditherSubMethod === 'blue-noise' ? getBlueNoiseMap(reqSize)
                  : ditherSubMethod === 'halftone'   ? (HALFTONE_MAPS[reqSize] || HALFTONE_MAPS[8])
                  :                                    (BAYER_MAPS[reqSize]    || BAYER_MAPS[8]);
        const mapSize = map.length || 8; 
        const spaceScale = SPACE_SCALES[colorSpace] || 1;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4; 
                const j = (y * width + x) * D;
                if (pixels[idx + 3] < 128) continue;
                
                const v0 = wbuf[j], v1 = wbuf[j+1], v2 = wbuf[j+2];
                let minDist = Infinity;
                let nearest = workingPalette[0];
                
                for (let i = 0; i < workingPalette.length; i++) {
                    const c = workingPalette[i];
                    const ox = c.offsetX || 0; const oy = c.offsetY || 0;
                    const mx = safeMod(x + ox, mapSize); const my = safeMod(y + oy, mapSize);
                    const patternVal = (map[my]?.[mx] || 0) / (mapSize * mapSize) - 0.5;
                    const spread = spaceScale * 0.4 * (dithering || 0.15) * 2;
                    const bias = patternVal * spread;
                    
                    const d0 = (v0 + bias*w0) - c.transformed[0];
                    const d1 = (v1 + bias*w1) - c.transformed[1];
                    const d2 = (v2 + bias*w2) - c.transformed[2];
                    const dist = d0*d0 + d1*d1 + d2*d2;
                    
                    if (dist < minDist) { minDist = dist; nearest = c; }
                }

                if (nearest) { pixels[idx] = nearest.displayR; pixels[idx+1] = nearest.displayG; pixels[idx+2] = nearest.displayB; }
            }
        }
    } else if (ditherCategory === 'geometric') {
        // N-candidate ordered dithering for irregular palettes.
        // Reference: matejlou (2023), "Ordered Dithering with Arbitrary or Irregular Colour Palettes",
        // https://matejlou.blog/2023/12/06/ordered-dithering-for-arbitrary-or-irregular-palettes/
        //
        // All four methods produce N candidate colours per pixel plus a weight per candidate, then
        // (per matejlou's Appendix I) sort candidates by display luminance and threshold-sample via
        // the Bayer matrix. The 'intensity' slider mixes the weight distribution toward a delta on
        // the actually-nearest colour: intensity = 0 -> always pick the nearest (no dither),
        // intensity = 1 -> the full per-method distribution.
        const reqSize = parseInt(bayerSize) || 8;
        const map = BAYER_MAPS[reqSize] || BAYER_MAPS[8];
        const mapSize = map.length || 8;
        const intensity = clamp(dithering ?? 1, 0, 1);
        const lum = c => 0.2126*c.displayR + 0.7152*c.displayG + 0.0722*c.displayB;

        // Pre-compute a luminance-sorted permutation of the palette once. Used by fw-dither for the
        // cumulative-threshold walk (Appendix I's "tally"-style optimisation).
        const paletteByLuminance = workingPalette
            .map((c, i) => [i, lum(c)])
            .sort((a, b) => a[1] - b[1])
            .map(x => x[0]);

        // Common candidate-sampler shared by knoll / n-closest / n-convex. Mixes the weight
        // distribution toward a delta on candidates[closestIndex], sorts by luminance, then
        // samples via the cumulative threshold position given by bayerVal in [0, 1).
        const sampleCandidates = (cands, weights, closestIndex, bayerVal) => {
            const N = cands.length;
            if (N === 0) return null;
            const mixed = new Array(N);
            let sumW = 0;
            for (let i = 0; i < N; i++) {
                const delta = (i === closestIndex) ? 1 : 0;
                mixed[i] = (1 - intensity) * delta + intensity * weights[i];
                sumW += mixed[i];
            }
            // Degenerate case: all weights collapsed to zero (intensity == 1 with all-zero IDW).
            if (sumW <= 0) return cands[closestIndex >= 0 ? closestIndex : 0];
            // Pair-sort by display luminance (Appendix I) -- this is what makes the dither
            // patterns *visible* on irregular palettes.
            const order = new Array(N);
            for (let i = 0; i < N; i++) order[i] = i;
            order.sort((a, b) => lum(cands[a]) - lum(cands[b]));
            // Cumulative threshold sample.
            let accum = 0;
            for (const idx of order) {
                accum += mixed[idx] / sumW;
                if (bayerVal < accum) return cands[idx];
            }
            return cands[order[N - 1]];
        };

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const j = (y * width + x) * D;
                if (pixels[idx+3] < 128) continue;

                const v0 = wbuf[j], v1 = wbuf[j+1], v2 = wbuf[j+2];
                const bayerVal = (map[y % mapSize]?.[x % mapSize] || 0) / (mapSize * mapSize);

                if (ditherSubMethod === 'knoll') {
                    // Knoll, US Patent 6,606,166 B1 (Adobe, 2003; expired 2019). matejlou (2023)
                    // describes it as: iterate N times allowing duplicates; the candidate weight
                    // is its FREQUENCY in the resulting list.
                    let g0 = v0, g1 = v1, g2 = v2;
                    const cands = [];
                    for (let n = 0; n < validNCandidates; n++) {
                        const nearest = getNearestColor([g0, g1, g2]);
                        if (!nearest) break;
                        cands.push(nearest);
                        g0 += (v0 - nearest.transformed[0]);
                        g1 += (v1 - nearest.transformed[1]);
                        g2 += (v2 - nearest.transformed[2]);
                    }
                    if (cands.length > 0) {
                        // Frequency-as-weight: every entry contributes 1/N, so duplicates of the
                        // same colour naturally sum into a higher selection probability.
                        const w = 1 / cands.length;
                        const weights = cands.map(() => w);
                        // The first iteration's pick IS the nearest colour to the input pixel.
                        const chosen = sampleCandidates(cands, weights, 0, bayerVal);
                        if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                    }
                }
                else if (ditherSubMethod === 'n-closest') {
                    // Lemström, Tarhio & Takala (1996), "Color Dithering with n-Best Algorithm".
                    // N nearest palette colours; weight w_i = 1 / d_i^s where d is true Euclidean.
                    const list = getNNearestColors([v0, v1, v2], validNCandidates);
                    if (list.length > 0) {
                        const cands = list.map(c => c.color);
                        // getNNearestColors returns SQUARED distances; sqrt to get true d for 1/d^s.
                        const weights = list.map(c => 1 / Math.pow(Math.max(Math.sqrt(c.dist), 1e-6), safeDistExp));
                        // List is ascending-by-distance, so index 0 is the actually-nearest.
                        const chosen = sampleCandidates(cands, weights, 0, bayerVal);
                        if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                    }
                }
                else if (ditherSubMethod === 'n-convex') {
                    // Lemström & Fränti (2000), "N-Candidate methods for location invariant
                    // dithering of color images". KEY difference from Knoll: candidates are
                    // marked as USED (no duplicates), and weights are IDW on distance-to-input.
                    let g0 = v0, g1 = v1, g2 = v2;
                    const cands = [];
                    const sqDists = [];
                    const used = new Set();
                    for (let n = 0; n < validNCandidates; n++) {
                        // Find nearest *unused* palette colour to the running goal.
                        let bestIdx = -1, bestDist = Infinity;
                        for (let p = 0; p < workingPalette.length; p++) {
                            if (used.has(p)) continue;
                            const c = workingPalette[p].transformed;
                            const a0 = c[0] - g0, a1 = c[1] - g1, a2 = c[2] - g2;
                            const d = a0*a0 + a1*a1 + a2*a2;
                            if (d < bestDist) { bestDist = d; bestIdx = p; }
                        }
                        if (bestIdx < 0) break;
                        used.add(bestIdx);
                        const nearest = workingPalette[bestIdx];
                        cands.push(nearest);
                        // IDW weight uses distance to the ORIGINAL pixel (not to the goal).
                        const d0 = v0 - nearest.transformed[0];
                        const d1 = v1 - nearest.transformed[1];
                        const d2 = v2 - nearest.transformed[2];
                        sqDists.push(d0*d0 + d1*d1 + d2*d2);
                        g0 += d0; g1 += d1; g2 += d2;
                    }
                    if (cands.length > 0) {
                        const weights = sqDists.map(d => 1 / Math.pow(Math.max(Math.sqrt(d), 1e-6), safeDistExp));
                        // First iteration picks the actual nearest -> closestIndex = 0.
                        const chosen = sampleCandidates(cands, weights, 0, bayerVal);
                        if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                    }
                }
                else if (ditherSubMethod === 'fw-dither') {
                    // Frank-Wolfe weights span the ENTIRE palette (not just N candidates), so we
                    // walk the palette in luminance order for the cumulative threshold rather
                    // than building a small candidate list.
                    const vArr = wbuf.subarray(j, j + D);
                    runFW(vArr);
                    // Locate the actual nearest palette colour for the intensity-mix delta.
                    let closestIdx = 0, minDist = Infinity;
                    for (let p = 0; p < workingPalette.length; p++) {
                        const c = workingPalette[p].transformed;
                        let d = 0;
                        for (let k = 0; k < D; k++) { const diff = c[k] - vArr[k]; d += diff * diff; }
                        if (d < minDist) { minDist = d; closestIdx = p; }
                    }
                    // Mix weights toward delta on closestIdx; walk in luminance order.
                    let sumW = 0;
                    const mixed = new Float32Array(workingPalette.length);
                    for (let p = 0; p < workingPalette.length; p++) {
                        const delta = (p === closestIdx) ? 1 : 0;
                        mixed[p] = (1 - intensity) * delta + intensity * fwWeights[p];
                        sumW += mixed[p];
                    }
                    let chosen = workingPalette[closestIdx];
                    if (sumW > 0) {
                        let accum = 0;
                        for (const p of paletteByLuminance) {
                            accum += mixed[p] / sumW;
                            if (bayerVal < accum) { chosen = workingPalette[p]; break; }
                        }
                    }
                    if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                }
            }
        }
    }
    ctx.putImageData(outputData, 0, 0);
};
