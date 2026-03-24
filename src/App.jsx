import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Upload, Download, Palette, Image as ImageIcon, RefreshCw, Maximize, 
  MoveVertical, MoveHorizontal, Sliders, Lock, Unlock, Contrast, Anchor, 
  FolderOpen, Save, FileJson, WrapText, ZoomIn, ZoomOut, 
  Maximize2, Minimize, Focus, SunMoon, RotateCcw, X, Link as LinkIcon, Unlink, Settings, FileType,
  Eye, EyeOff, Layers, MousePointer2, Dices, Library, Film, Play, Pause, Video
} from 'lucide-react';

// ==========================================
// 1. MATH & COLOR UTILITIES
// ==========================================

const clamp = (v, min, max) => isNaN(v) ? min : Math.max(min, Math.min(max, v));
const safeMod = (n, m) => ((n % m) + m) % m;
const generateId = () => Math.random().toString(36).substr(2, 9);
const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
const hexToRgb = (hex) => {
  const bigint = parseInt(hex.slice(1), 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

// ==========================================
// 2. CONFIG & CONSTANTS
// ==========================================

const ColorSpaceConverter = {
    srgb: {
        to: (r, g, b) => [r, g, b],
        from: (v0, v1, v2) => [v0, v1, v2]
    },
    linear: {
        to: (r, g, b) => {
            const f = c => { c/=255; return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
            return [f(r), f(g), f(b)];
        },
        from: (v0, v1, v2) => {
            const f = c => {
                if (c <= 0) return 0;
                if (c >= 1) return 255;
                return (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1/2.4) - 0.055) * 255;
            };
            return [f(v0), f(v1), f(v2)];
        }
    },
    oklab: {
        to: (r, g, b) => {
            const [lr, lg, lb] = ColorSpaceConverter.linear.to(r, g, b);
            const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
            const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073970337 * lb;
            const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
            const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
            return [
                0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720456 * s_,
                1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
                0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
            ];
        },
        from: (L, a, b) => {
            const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
            const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
            const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
            const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
            const lr =  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
            const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
            const lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
            return ColorSpaceConverter.linear.from(lr, lg, lb);
        }
    },
    lab: {
        to: (r, g, b) => {
            const [R, G, B] = ColorSpaceConverter.linear.to(r, g, b);
            let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
            let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
            let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
            X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
            X = X > 0.008856 ? Math.pow(X, 1/3) : 7.787 * X + 16/116;
            Y = Y > 0.008856 ? Math.pow(Y, 1/3) : 7.787 * Y + 16/116;
            Z = Z > 0.008856 ? Math.pow(Z, 1/3) : 7.787 * Z + 16/116;
            return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
        },
        from: (L, a, b) => {
            let y = (L + 16) / 116;
            let x = a / 500 + y;
            let z = y - b / 200;
            const y3 = y * y * y, x3 = x * x * x, z3 = z * z * z;
            y = y3 > 0.008856 ? y3 : (y - 16/116) / 7.787;
            x = x3 > 0.008856 ? x3 : (x - 16/116) / 7.787;
            z = z3 > 0.008856 ? z3 : (z - 16/116) / 7.787;
            x *= 0.95047; y *= 1.00000; z *= 1.08883;
            const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
            const lg = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
            const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
            return ColorSpaceConverter.linear.from(lr, lg, lb);
        }
    },
    yuv: {
        to: (r, g, b) => [
            0.299 * r + 0.587 * g + 0.114 * b,
            -0.14713 * r - 0.28886 * g + 0.436 * b,
            0.615 * r - 0.51499 * g - 0.10001 * b
        ],
        from: (y, u, v) => [
            y + 1.13983 * v,
            y - 0.39465 * u - 0.58060 * v,
            y + 2.03211 * u
        ]
    }
};

const SPACE_SCALES = { srgb: 255, linear: 1, oklab: 1, lab: 100, yuv: 255 };

const PRESET_PALETTES = {
  "Handhelds": {
    "Game Boy": {
      "Classic (BGB)": ["#e0f8d0", "#88c070", "#346856", "#081820"],
      "Pocket (Gray)": ["#e3e6c9", "#c6cba4", "#8e8f5e", "#232323"],
      "Light (Blue)": ["#00b2a0", "#008a70", "#005240", "#002810"]
    },
    "Game Boy Color": {
      "GBC - Red": ["#f8e8c8", "#d89048", "#a82820", "#000000"],
      "GBC - Blue": ["#ffffa8", "#68a8f8", "#0000fc", "#000000"],
      "GBC - Green": ["#f8e8c8", "#58d854", "#389020", "#000000"],
      "GBC - Yellow": ["#f8f8f8", "#f8f858", "#a8a800", "#000000"],
      "GBC - Pastel Mix": ["#f8e8c8", "#f8a8b8", "#7890f8", "#000000"]
    },
    "SEGA Game Gear": {
      "System Master": ["#000000", "#555555", "#aaaaaa", "#ffffff", "#550000", "#aa0000", "#ff0000", "#005500", "#00aa00", "#00ff00", "#000055", "#0000aa", "#0000ff", "#aaaa55", "#55aaaa", "#aa55aa"]
    }
  },
  "Home Consoles": {
    "NES / Famicom": {
      "Hardware (55 Colors)": [
        "#7c7c7c", "#0000fc", "#0000bc", "#4428bc", "#940084", "#a80020", "#a81000", "#881400", "#503000", "#007800", "#006800", "#005800", "#004058", "#000000", 
        "#bcbcbc", "#0078f8", "#0058f8", "#6844fc", "#d800cc", "#e40058", "#f83800", "#e45c10", "#ac7c00", "#00b800", "#00a800", "#00a844", "#008888", 
        "#f8f8f8", "#3cbcfc", "#6888fc", "#9878f8", "#f878f8", "#f85898", "#f87858", "#fca044", "#f8b800", "#b8f818", "#58d854", "#58f898", "#00e8d8", "#787878", 
        "#a4e4fc", "#b8b8f8", "#d8b8f8", "#f8b8f8", "#f8a4c0", "#f0d0b0", "#fce0a8", "#f8d878", "#d8f878", "#b8f8b8", "#b8f8d8", "#00fcfc", "#f8d8f8"
      ]
    },
    "Atari 2600": {
      "NTSC Subset (16 Colors)": ["#000000", "#404040", "#808080", "#c0c0c0", "#ffffff", "#b00000", "#ff5050", "#c000b0", "#ff50ff", "#0000b0", "#5050ff", "#00b000", "#50ff50", "#b0b000", "#ffff50", "#b05000"]
    }
  },
  "Vintage Computers": {
    "IBM PC (CGA)": {
      "Mode 4 - Pal 0 (High)": ["#000000", "#55ff55", "#ff5555", "#ffff55"],
      "Mode 4 - Pal 1 (High)": ["#000000", "#55ffff", "#ff55ff", "#ffffff"]
    },
    "Commodore 64": {
      "Pepto Default (16 Colors)": ["#000000", "#ffffff", "#880000", "#aaffee", "#cc44cc", "#00cc55", "#0000aa", "#eeee77", "#dd8855", "#664400", "#ff7777", "#333333", "#777777", "#aaff66", "#0088ff", "#bbbbbb"]
    },
    "Apple Macintosh": {
      "System 8 (16-Color)": ["#ffffff", "#fbf305", "#ff6403", "#dd0907", "#f20884", "#4700a5", "#0000d3", "#02abea", "#1fb714", "#006412", "#562c05", "#90713a", "#c0c0c0", "#808080", "#404040", "#000000"]
    }
  },
  "Pixel Art & Fantasy": {
    "PICO-8": {
      "Standard (16 Colors)": ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"]
    },
    "DawnBringer": {
      "DB16": ["#140c1c", "#442434", "#30346d", "#4e4a4e", "#854c30", "#346524", "#d04648", "#757161", "#597dce", "#d27d2c", "#8595a1", "#6daa2c", "#d2aa99", "#6dc2ca", "#dad45e", "#deeed6"]
    }
  },
  "Themes & CMYK": {
    "CMYK Basic": {
      "CMYK+W": ["#ffffff", "#00ffff", "#ff00ff", "#ffff00", "#000000"]
    },
    "Monochrome": {
      "1-Bit Noir": ["#000000", "#ffffff"],
      "Matrix Green": ["#020b00", "#00ff41"]
    }
  }
};

const ERROR_KERNELS = {
    'floyd': [ { x: 1, y: 0, f: 7/16 }, { x: -1, y: 1, f: 3/16 }, { x: 0, y: 1, f: 5/16 }, { x: 1, y: 1, f: 1/16 } ],
    'atkinson': [ { x: 1, y: 0, f: 1/8 }, { x: 2, y: 0, f: 1/8 }, { x: -1, y: 1, f: 1/8 }, { x: 0, y: 1, f: 1/8 }, { x: 1, y: 1, f: 1/8 }, { x: 0, y: 2, f: 1/8 } ],
    'sierra': [ {x:1,y:0,f:5/32}, {x:2,y:0,f:3/32}, {x:-2,y:1,f:2/32}, {x:-1,y:1,f:4/32}, {x:0,y:1,f:5/32}, {x:1,y:1,f:4/32}, {x:2,y:1,f:2/32}, {x:-1,y:2,f:2/32}, {x:0,y:2,f:3/32}, {x:1,y:2,f:2/32} ],
    'sierra-lite': [ {x:1,y:0,f:2/4}, {x:-1,y:1,f:1/4}, {x:0,y:1,f:1/4} ],
    'stucki': [ {x:1,y:0,f:8/42},{x:2,y:0,f:4/42},{x:-2,y:1,f:2/42},{x:-1,y:1,f:4/42},{x:0,y:1,f:8/42},{x:1,y:1,f:4/42},{x:2,y:1,f:2/42},{x:-2,y:2,f:1/42},{x:-1,y:2,f:2/42},{x:0,y:2,f:4/42},{x:1,y:2,f:2/42},{x:2,y:2,f:1/42} ],
    'burkes': [ {x:1,y:0,f:8/32},{x:2,y:0,f:4/32},{x:-2,y:1,f:2/32},{x:-1,y:1,f:4/32},{x:0,y:1,f:8/32},{x:1,y:1,f:4/32},{x:2,y:1,f:2/32} ]
};

// ==========================================
// 3. DITHERING & PALETTE ALGORITHMS
// ==========================================

const generateBayerMatrix = (n) => {
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

const generateHalftoneMatrix = (n) => {
    const matrix = Array(n).fill().map(() => Array(n).fill(0));
    const center = (n - 1) / 2.0;
    const points = [];
    for(let y=0; y<n; y++) for(let x=0; x<n; x++) points.push({x, y, d: Math.pow(x-center, 2) + Math.pow(y-center, 2)});
    points.sort((a,b) => a.d - b.d);
    points.forEach((p, i) => matrix[p.y][p.x] = i);
    return matrix;
};

const BAYER_MAPS = { 2: generateBayerMatrix(2), 4: generateBayerMatrix(4), 8: generateBayerMatrix(8), 16: generateBayerMatrix(16), 32: generateBayerMatrix(32) };
const HALFTONE_MAPS = { 2: generateHalftoneMatrix(2), 4: generateHalftoneMatrix(4), 8: generateHalftoneMatrix(8), 16: generateHalftoneMatrix(16), 32: generateHalftoneMatrix(32) };

const getOstromoukhovKernel = (intensity) => {
    const t = clamp(intensity / 255.0, 0, 1);
    const d1 = 13 + t * (1 - t) * 4 * (4 - 13);
    const d2 = 5 + t * (1 - t) * 4 * (4 - 5);
    const d3 = 5 + t * (1 - t) * 4 * (15 - 5);
    const d4 = 9; 
    const sum = d1 + d2 + d3 + d4;
    return [ {x:1, y:0, f: d1/sum}, {x:-1, y:1, f: d2/sum}, {x:0, y:1, f: d3/sum}, {x:1, y:1, f: d4/sum} ];
};

const generateHilbertCurve = (width, height) => {
    const size = Math.pow(2, Math.ceil(Math.log2(Math.max(width, height))));
    const points = [];
    const hilbert = (x, y, xi, xj, yi, yj, n) => {
        if (n <= 0) {
            if (x >= 0 && x < width && y >= 0 && y < height) points.push({x: Math.floor(x), y: Math.floor(y)});
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

const extractPaletteHull = (pixels, k, settings, lockedColors = []) => {
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

const findNearestColorEuclidean = (v0, v1, v2, palette) => {
    let minDist = Infinity; let nearest = palette[0]; 
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i]; 
        const d0 = v0 - p.transformed[0], d1 = v1 - p.transformed[1], d2 = v2 - p.transformed[2];
        const d = d0*d0 + d1*d1 + d2*d2;
        if (d < minDist) { minDist = d; nearest = p; }
    }
    return nearest;
};

const findNNearestColorsEuclidean = (v0, v1, v2, palette, n) => {
    const distances = palette.map(p => {
        const d0 = v0 - p.transformed[0], d1 = v1 - p.transformed[1], d2 = v2 - p.transformed[2];
        return { color: p, dist: d0*d0 + d1*d1 + d2*d2 };
    });
    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, n);
};

const sortPalette = (palette, mode) => {
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

const renderDitheredImage = (canvas, sourceData, palette, settings) => {
    if (!canvas || !sourceData || !palette.length) return;
    const ctx = canvas.getContext('2d');
    canvas.width = sourceData.width; canvas.height = sourceData.height;
    
    const outputData = new ImageData(new Uint8ClampedArray(sourceData.pixels), sourceData.width, sourceData.height);
    const pixels = outputData.data;
    const { width, height } = sourceData;
    
    const { colorSpace, manualWeights, ditherCategory, ditherSubMethod, dithering, bayerSize, serpentine, nCandidates, distanceExponent, riemersmaHistory, ditherSeed, matchMethod } = settings;
    const Converter = ColorSpaceConverter[colorSpace];
    
    // Scale Euclidean space internally based on manual weights to unify all distance math
    const w0 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.r) : 1;
    const w1 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.g) : 1;
    const w2 = colorSpace === 'srgb' || colorSpace === 'linear' ? Math.sqrt(manualWeights.b) : 1;
    
    const workingPalette = palette.map(p => {
        const [v0, v1, v2] = Converter.to(p.r, p.g, p.b);
        return { ...p, transformed: [v0 * w0, v1 * w1, v2 * w2] };
    });

    const wbuf = new Float32Array(width * height * 3);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
        const [v0, v1, v2] = Converter.to(pixels[i], pixels[i+1], pixels[i+2]);
        wbuf[j] = v0 * w0; wbuf[j+1] = v1 * w1; wbuf[j+2] = v2 * w2;
    }

    const validNCandidates = Math.max(1, nCandidates || 4);
    const safeDistExp = distanceExponent || 2.0;

    const prng = (x, y, seed) => {
        let h = Math.sin(x * 12.9898 + y * 78.233 + (seed || 0) * 137.5) * 43758.5453;
        let val = h - Math.floor(h);
        return isNaN(val) ? 0 : val;
    };

    // Pre-allocated buffers for Frank-Wolfe NNLS
    const fwWeights = new Float32Array(workingPalette.length);
    const fwCurrentPos = new Float32Array(3);
    const fwError = new Float32Array(3);
    const fwDelta = new Float32Array(3);

    const runFW = (v0, v1, v2) => {
        const P = workingPalette.length;
        fwWeights.fill(0);
        
        let bestStartIdx = 0, minDist = Infinity;
        for (let p = 0; p < P; p++) {
            const c = workingPalette[p].transformed;
            const d0 = c[0] - v0, d1 = c[1] - v1, d2 = c[2] - v2;
            const d = d0*d0 + d1*d1 + d2*d2;
            if (d < minDist) { minDist = d; bestStartIdx = p; }
        }

        fwWeights[bestStartIdx] = 1.0;
        const startC = workingPalette[bestStartIdx].transformed;
        fwCurrentPos[0] = startC[0]; fwCurrentPos[1] = startC[1]; fwCurrentPos[2] = startC[2];

        for (let iter = 0; iter < 15; iter++) {
            fwError[0] = fwCurrentPos[0] - v0;
            fwError[1] = fwCurrentPos[1] - v1;
            fwError[2] = fwCurrentPos[2] - v2;

            let minDot = Infinity;
            let bestIdx = -1;

            for (let p = 0; p < P; p++) {
                const c = workingPalette[p].transformed;
                const dot = c[0]*fwError[0] + c[1]*fwError[1] + c[2]*fwError[2];
                if (dot < minDot) { minDot = dot; bestIdx = p; }
            }

            const targetC = workingPalette[bestIdx].transformed;
            fwDelta[0] = targetC[0] - fwCurrentPos[0];
            fwDelta[1] = targetC[1] - fwCurrentPos[1];
            fwDelta[2] = targetC[2] - fwCurrentPos[2];

            const deltaSq = fwDelta[0]*fwDelta[0] + fwDelta[1]*fwDelta[1] + fwDelta[2]*fwDelta[2];
            if (deltaSq < 1e-6) break;

            const errDotDelta = fwError[0]*fwDelta[0] + fwError[1]*fwDelta[1] + fwError[2]*fwDelta[2];
            const gamma = clamp(-errDotDelta / deltaSq, 0, 1);

            if (gamma === 0) break;

            fwCurrentPos[0] += gamma * fwDelta[0];
            fwCurrentPos[1] += gamma * fwDelta[1];
            fwCurrentPos[2] += gamma * fwDelta[2];

            for (let p = 0; p < P; p++) fwWeights[p] *= (1 - gamma);
            fwWeights[bestIdx] += gamma;
        }
    };

    const getNearestColor = (v0, v1, v2) => {
        if (matchMethod === 'fw') {
            runFW(v0, v1, v2);
            let maxW = -1;
            let bestC = workingPalette[0];
            for (let p = 0; p < workingPalette.length; p++) {
                if (fwWeights[p] > maxW) {
                    maxW = fwWeights[p];
                    bestC = workingPalette[p];
                }
            }
            return bestC;
        }
        return findNearestColorEuclidean(v0, v1, v2, workingPalette);
    };

    const getNNearestColors = (v0, v1, v2, n) => {
        if (matchMethod === 'fw') {
            runFW(v0, v1, v2);
            const candidates = workingPalette.map((color, i) => {
                const c = color.transformed;
                const d0 = c[0] - v0, d1 = c[1] - v1, d2 = c[2] - v2;
                return { color, weight: fwWeights[i], dist: d0*d0 + d1*d1 + d2*d2 };
            });
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates.slice(0, n);
        }
        return findNNearestColorsEuclidean(v0, v1, v2, workingPalette, n);
    };

    if (ditherCategory === 'analytical') {
        for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
            if (pixels[i+3] < 128) continue;
            const v0 = wbuf[j], v1 = wbuf[j+1], v2 = wbuf[j+2];
            
            if (ditherSubMethod === 'linear-projection') {
                runFW(v0, v1, v2);
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
                continue; 
            }
            const nearest = getNearestColor(v0, v1, v2);
            if (nearest) { pixels[i] = nearest.displayR; pixels[i+1] = nearest.displayG; pixels[i+2] = nearest.displayB; }
        }
    } else if (ditherCategory === 'flow') {
        const safeRiemersmaHistory = riemersmaHistory || 16;
        if (ditherSubMethod === 'riemersma') {
            const curve = generateHilbertCurve(width, height);
            const history = [];
            const Hweights = Array.from({length: safeRiemersmaHistory}, (_, i) => Math.exp(-i / (safeRiemersmaHistory / 4)));
            const sumWeights = Hweights.reduce((a,b)=>a+b, 0);

            for (const {x, y} of curve) {
                const idx = (y * width + x) * 4;
                const j = (y * width + x) * 3;
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
                
                const nearest = getNearestColor(safe0, safe1, safe2);
                
                if (nearest) {
                    pixels[idx] = nearest.displayR; pixels[idx+1] = nearest.displayG; pixels[idx+2] = nearest.displayB;
                    history.unshift({ e0: safe0 - nearest.transformed[0], e1: safe1 - nearest.transformed[1], e2: safe2 - nearest.transformed[2] });
                }
                if (history.length > safeRiemersmaHistory) history.pop();
            }
        } else {
            for (let y = 0; y < height; y++) {
                const isRev = serpentine && (y % 2 === 1);
                const startX = isRev ? width - 1 : 0; const endX = isRev ? -1 : width; const stepX = isRev ? -1 : 1;
                for (let x = startX; x !== endX; x += stepX) {
                    const idx = (y * width + x) * 4; 
                    const j = (y * width + x) * 3;
                    if (pixels[idx + 3] < 128) continue;
                    
                    const old0 = wbuf[j], old1 = wbuf[j+1], old2 = wbuf[j+2];
                    
                    // Clamp to RGB Gamut boundaries to strictly prevent mathematically runaway accumulation
                    const [origR, origG, origB] = Converter.from(old0/w0, old1/w1, old2/w2);
                    const cR = clamp(origR, 0, 255);
                    const cG = clamp(origG, 0, 255);
                    const cB = clamp(origB, 0, 255);
                    
                    const [t0, t1, t2] = Converter.to(cR, cG, cB);
                    const safe0 = t0 * w0;
                    const safe1 = t1 * w1;
                    const safe2 = t2 * w2;
                    
                    const nearest = getNearestColor(safe0, safe1, safe2);
                    if (nearest) {
                        pixels[idx] = nearest.displayR; pixels[idx+1] = nearest.displayG; pixels[idx+2] = nearest.displayB;
                        
                        const err0 = (safe0 - nearest.transformed[0]) * (dithering || 0.15);
                        const err1 = (safe1 - nearest.transformed[1]) * (dithering || 0.15);
                        const err2 = (safe2 - nearest.transformed[2]) * (dithering || 0.15);
                        
                        const kernel = ditherSubMethod === 'ostromoukhov' ? getOstromoukhovKernel((cR+cG+cB)/3) : (ERROR_KERNELS[ditherSubMethod] || ERROR_KERNELS.floyd);
                        
                        kernel.forEach(k => {
                            const dx = isRev ? -k.x : k.x, dy = k.y; 
                            if (x + dx >= 0 && x + dx < width && y + dy < height) {
                                const nIdx = ((y + dy) * width + (x + dx)) * 3;
                                wbuf[nIdx] += err0 * k.f; wbuf[nIdx+1] += err1 * k.f; wbuf[nIdx+2] += err2 * k.f;
                            }
                        });
                    }
                }
            }
        }
    } else if (ditherCategory === 'pattern') {
        const reqSize = ditherSubMethod === 'blue-noise' ? 8 : (parseInt(bayerSize) || 8);
        const map = ditherSubMethod === 'halftone' ? (HALFTONE_MAPS[reqSize] || HALFTONE_MAPS[8]) : (BAYER_MAPS[reqSize] || BAYER_MAPS[8]);
        const mapSize = map.length || 8; 
        const spaceScale = SPACE_SCALES[colorSpace] || 1;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4; 
                const j = (y * width + x) * 3;
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
        const reqSize = parseInt(bayerSize) || 8;
        const map = BAYER_MAPS[reqSize] || BAYER_MAPS[8];
        const mapSize = map.length || 8;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const j = (y * width + x) * 3;
                if (pixels[idx+3] < 128) continue;
                
                let v0 = wbuf[j], v1 = wbuf[j+1], v2 = wbuf[j+2];
                const bayerVal = (map[y % mapSize]?.[x % mapSize] || 0) / (mapSize * mapSize);

                if (ditherSubMethod === 'knoll') {
                    let g0 = v0, g1 = v1, g2 = v2;
                    const candidates = [];
                    for (let n = 0; n < validNCandidates; n++) {
                        const nearest = getNearestColor(g0, g1, g2);
                        candidates.push(nearest);
                        if (nearest) {
                            g0 += (v0 - nearest.transformed[0]); 
                            g1 += (v1 - nearest.transformed[1]); 
                            g2 += (v2 - nearest.transformed[2]);
                        }
                    }
                    const randVal = prng(x, y, settings.ditherSeed);
                    const chosenIndex = clamp(Math.floor(randVal * validNCandidates), 0, validNCandidates - 1);
                    const chosen = candidates[chosenIndex] || candidates[0];
                    if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                } 
                else if (ditherSubMethod === 'fw-dither') {
                    runFW(v0, v1, v2);
                    let accum = 0;
                    let chosen = workingPalette[0];
                    for (let p = 0; p < workingPalette.length; p++) {
                        if (fwWeights[p] > 0.001) {
                            accum += fwWeights[p];
                            if (bayerVal <= accum) { chosen = workingPalette[p]; break; }
                        }
                    }
                    if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                }
                else if (ditherSubMethod === 'n-closest') {
                    const candidates = getNNearestColors(v0, v1, v2, validNCandidates);
                    let sumWeights = 0;
                    candidates.forEach(c => { c.weight = 1.0 / Math.pow(Math.max(c.dist, 0.001), safeDistExp); sumWeights += c.weight; });
                    let accum = 0; let chosen = candidates[0]?.color;
                    for (let c of candidates) {
                        accum += (c.weight / sumWeights);
                        if (bayerVal <= accum) { chosen = c.color || chosen; break; }
                    }
                    if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                }
                else if (ditherSubMethod === 'n-convex') {
                    let g0 = v0, g1 = v1, g2 = v2;
                    const candidates = [];
                    for (let n = 0; n < validNCandidates; n++) {
                        const nearest = getNearestColor(g0, g1, g2);
                        if (nearest) {
                            const d0 = v0 - nearest.transformed[0], d1 = v1 - nearest.transformed[1], d2 = v2 - nearest.transformed[2];
                            candidates.push({color: nearest, dist: d0*d0 + d1*d1 + d2*d2});
                            g0 += (v0 - nearest.transformed[0]); g1 += (v1 - nearest.transformed[1]); g2 += (v2 - nearest.transformed[2]);
                        }
                    }
                    let sumWeights = 0;
                    candidates.forEach(c => { c.weight = 1.0 / Math.pow(Math.max(c.dist, 0.001), safeDistExp); sumWeights += c.weight; });
                    let accum = 0; let chosen = candidates[0]?.color;
                    for (let c of candidates) {
                        accum += (c.weight / sumWeights);
                        if (bayerVal <= accum) { chosen = c.color || chosen; break; }
                    }
                    if (chosen) { pixels[idx] = chosen.displayR; pixels[idx+1] = chosen.displayG; pixels[idx+2] = chosen.displayB; }
                }
            }
        }
    }
    ctx.putImageData(outputData, 0, 0);
};

// ==========================================
// 4. UI ATOMS (Design System)
// ==========================================

const getThemeStyles = (isDark) => ({
    appContainer: `flex flex-col-reverse md:flex-row h-screen w-full overflow-hidden transition-colors duration-300 ${isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'}`,
    panel: `w-full md:w-[320px] flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-r z-10 shadow-2xl h-1/2 md:h-full min-h-0 ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`,
    panelHeader: `p-4 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-neutral-800 bg-neutral-900' : 'border-neutral-200 bg-white'}`,
    label: `text-xs font-bold uppercase tracking-widest ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`,
    textMuted: `text-xs ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`,
    heading: `text-sm font-semibold tracking-tight ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`,
    input: `text-xs p-1.5 border transition-all focus:outline-none focus:ring-1 focus:ring-neutral-500/50 ${isDark ? 'bg-neutral-950 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'}`,
    select: `w-full text-xs p-1.5 border transition-all focus:outline-none focus:ring-1 focus:ring-neutral-500/50 appearance-none cursor-pointer ${isDark ? 'bg-neutral-950 border-neutral-700 text-neutral-100' : 'bg-white border-neutral-300 text-neutral-900'}`,
    range: `w-full h-1.5 appearance-none cursor-pointer ${isDark ? 'bg-neutral-950' : 'bg-white'} [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-neutral-500 dark:[&::-webkit-slider-thumb]:bg-neutral-400 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:bg-neutral-500 dark:[&::-moz-range-thumb]:bg-neutral-400 [&::-moz-range-thumb]:border-none [&::-moz-range-track]:bg-transparent`,
    button: `p-1.5 transition-colors flex items-center justify-center gap-1 font-medium border border-transparent hover:bg-neutral-100 ${isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-neutral-600 hover:text-black hover:bg-neutral-100'}`,
    buttonActive: `p-1 transition-colors flex items-center justify-center font-medium border ${isDark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-neutral-200 border-neutral-300 text-black'}`,
    buttonGhost: `p-1 transition-colors ${isDark ? 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/50' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}`,
    segmentGroup: `flex p-0.5 gap-0.5 border ${isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`,
    segmentButton: (isActive) => `flex-1 py-1 text-xs font-bold uppercase tracking-tighter transition-all ${isActive ? (isDark ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm') : (isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-900')}`,
    toolbar: `absolute bottom-6 left-1/2 transform -translate-x-1/2 backdrop-blur-md shadow-xl border z-40 transition-all ${isDark ? 'bg-neutral-900/90 border-neutral-700 text-neutral-200' : 'bg-white/90 border-neutral-200 text-neutral-700'}`,
    popover: `fixed z-50 shadow-2xl p-3 border ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-neutral-200'}`,
    divider: `w-full h-px ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`,
    section: `flex flex-col gap-2.5`
});

const PanelSection = ({ title, action, children, styles }) => (
    <section className={styles.section}>
        {(title || action) && (
            <div className="flex justify-between items-end">
                {title && <h3 className={styles.label} style={{marginBottom: 0}}>{title}</h3>}
                {action}
            </div>
        )}
        {children}
    </section>
);

const NumberInput = ({ value, onChange, label, styles, className = "" }) => (
    <div className={`relative flex items-center ${className}`}>
        {label && <span className="absolute left-2 text-xs font-bold text-neutral-400 pointer-events-none">{label}</span>}
        <input type="number" value={value} onChange={onChange} className={`${styles.input} w-full font-mono ${label ? 'pl-6' : ''}`} />
    </div>
);

const Select = ({ value, onChange, options, optgroups, styles, className = "" }) => (
    <select value={value} onChange={onChange} className={`${styles.select} ${className}`}>
        {optgroups ? Object.entries(optgroups).map(([label, opts]) => (
            <optgroup key={label} label={label}>
                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
        )) : options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);

const RangeSlider = ({ value, min, max, step, onChange, styles, className = "" }) => (
    <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className={`${styles.range} ${className}`} />
);

const IconButton = ({ onClick, icon: Icon, title, styles, className = "" }) => (
    <button onClick={onClick} className={`${styles.buttonGhost} ${className}`} title={title}>
        <Icon size={14} />
    </button>
);

const StepperInput = ({ value, onDecrease, onIncrease, onChange, onBlur, onKeyDown, styles, isDark }) => (
    <div className={`flex items-center border ${isDark ? 'border-neutral-700 bg-neutral-950' : 'border-neutral-300 bg-white'}`}>
        <button onClick={onDecrease} className={`${styles.buttonGhost} px-2 py-0.5 hover:bg-neutral-500/10`}>-</button>
        <input type="text" value={value} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} className={`w-10 text-center text-xs py-0.5 m-0 border-none bg-transparent focus:outline-none ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`} />
        <button onClick={onIncrease} className={`${styles.buttonGhost} px-2 py-0.5 hover:bg-neutral-500/10`}>+</button>
    </div>
);

// ==========================================
// 5. FEATURE COMPONENTS
// ==========================================

const PaletteLibraryModal = ({ isOpen, onClose, onApply, styles, isDark }) => {
    const [activeCategory, setActiveCategory] = useState("Handhelds");
    const [activeDevice, setActiveDevice] = useState("Game Boy");
    if (!isOpen) return null;
    const categories = Object.keys(PRESET_PALETTES);
    const devices = Object.keys(PRESET_PALETTES[activeCategory]);
    const safeDevice = devices.includes(activeDevice) ? activeDevice : devices[0];
    const palettes = PRESET_PALETTES[activeCategory][safeDevice];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className={`${styles.popover} w-full max-w-lg flex flex-col shadow-2xl`} style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
                <div className={`flex justify-between items-center mb-4 pb-3 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <div className="flex items-center gap-2"><Library className="w-4 h-4 text-neutral-500" /><span className="text-xs font-bold uppercase tracking-wider">Palette Library</span></div>
                    <button onClick={onClose} className={`hover:text-neutral-600 ${isDark ? 'text-neutral-400 hover:text-neutral-200' : 'text-neutral-400'}`}><X size={16} /></button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <Select styles={styles} value={activeCategory} onChange={e => { setActiveCategory(e.target.value); setActiveDevice(Object.keys(PRESET_PALETTES[e.target.value])[0]); }} options={categories.map(c => ({value: c, label: c}))} />
                    <Select styles={styles} value={safeDevice} onChange={e => setActiveDevice(e.target.value)} options={devices.map(d => ({value: d, label: d}))} />
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                    {Object.entries(palettes).map(([name, colors]) => (
                        <div key={name} className={`border p-3 cursor-pointer transition-all ${isDark ? 'border-neutral-800 hover:bg-neutral-800' : 'border-neutral-200 hover:bg-neutral-50'}`} onClick={() => onApply(colors)}>
                            <div className="text-xs font-bold mb-2 flex justify-between"><span className={isDark ? 'text-neutral-300' : 'text-neutral-700'}>{name}</span><span className="text-neutral-500">{colors.length} colors</span></div>
                            <div className={`grid gap-0 overflow-hidden shadow-sm border border-transparent`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(8, 100/colors.length)}%, 1fr))`, height: colors.length > 32 ? '64px' : '32px' }}>
                                {colors.map((c, i) => <div key={i} style={{backgroundColor: c, width: '100%', height: '100%'}}></div>)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ImageSetupPanel = ({ styles, isDark, settings, updateSetting, imageLoaded, onResetOriginalSize, isAnimation, isVideo }) => {
    const showMatchMethod = settings.ditherCategory !== 'pattern' && settings.ditherSubMethod !== 'linear-projection' && settings.ditherSubMethod !== 'fw-dither';
    return (
        <PanelSection styles={styles} title="Image Setup" action={
            imageLoaded ? <button onClick={onResetOriginalSize} className="text-xs uppercase font-bold text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 flex items-center gap-1"><RotateCcw size={10} /> Original</button> : null
        }>
            <div className="grid grid-cols-2 gap-2">
                <NumberInput label="W" styles={styles} value={settings.width} onChange={(e) => { const w = clamp(Number(e.target.value), 32, 5000); updateSetting('width', w); updateSetting('height', Math.round(w / settings.aspectRatio)); }} />
                <NumberInput label="H" styles={styles} value={settings.height} onChange={(e) => { const h = clamp(Number(e.target.value), 32, 5000); updateSetting('height', h); updateSetting('width', Math.round(h * settings.aspectRatio)); }} />
            </div>
            <RangeSlider styles={styles} min={32} max={640} step={4} value={Math.min(settings.width, 640)} onChange={(e) => { const w = clamp(Number(e.target.value), 32, 5000); updateSetting('width', w); updateSetting('height', Math.round(w / settings.aspectRatio)); }} />
            {isAnimation && (
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-neutral-400 uppercase">Video Framerate</span>
                    <Select styles={styles} className="w-24 py-1" value={settings.videoFps || 30} onChange={(e) => updateSetting('videoFps', Number(e.target.value))} options={[12,15,24,30,60].map(v => ({value: v, label: `${v} FPS`}))} />
                </div>
            )}
            <Select styles={styles} value={settings.colorSpace} onChange={(e) => updateSetting('colorSpace', e.target.value)} optgroups={{
                "Standard": [{value: 'srgb', label: 'sRGB (Default)'}, {value: 'linear', label: 'Linear RGB'}],
                "Perceptual": [{value: 'oklab', label: 'Oklab (High Quality)'}, {value: 'lab', label: 'CIE Lab'}],
                "Broadcast": [{value: 'yuv', label: 'YUV'}]
            }} />
            {showMatchMethod && (
                <Select styles={styles} value={settings.matchMethod || 'euclidean'} onChange={(e) => updateSetting('matchMethod', e.target.value)} optgroups={{
                    "Color Matching": [{value: 'euclidean', label: 'Euclidean Minimum'}, {value: 'fw', label: 'FW Highest Weight (Slow)'}]
                }} />
            )}
            {(settings.colorSpace === 'srgb' || settings.colorSpace === 'linear') && (
                <div className={`p-3 border space-y-2 ${isDark ? 'bg-neutral-900 border-neutral-700' : 'bg-neutral-50 border-neutral-200'}`}>
                    <span className="text-xs font-bold text-neutral-400 uppercase">Luma Weights</span>
                    {['r', 'g', 'b'].map(c => (
                        <div key={c} className="flex items-center gap-2">
                            <span className="w-3 text-xs font-bold uppercase text-neutral-500">{c}</span>
                            <RangeSlider styles={styles} min={0} max={1} step={0.01} value={settings.manualWeights[c]} onChange={(e) => updateSetting('manualWeights', { ...settings.manualWeights, [c]: Number(e.target.value) })} />
                        </div>
                    ))}
                </div>
            )}
        </PanelSection>
    );
};

const PalettePanel = ({ styles, isDark, settings, updateSetting, paletteData, onPaletteAction }) => {
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [tempColorCount, setTempColorCount] = useState(settings.paletteSize.toString());
    const paletteImportRef = useRef(null); const extractInputRef = useRef(null);
    useEffect(() => setTempColorCount(settings.paletteSize.toString()), [settings.paletteSize]);
    const applyColorCount = (val) => { let num = clamp(parseInt(val) || 2, 2, 256); updateSetting('paletteSize', num); setTempColorCount(num.toString()); };

    return (
        <PanelSection styles={styles} title="Palette">
            <div className="flex justify-between items-center">
                <div className="flex gap-0.5 items-center">
                    <IconButton styles={styles} icon={Lock} onClick={() => onPaletteAction.toggleAllLocks(true)} title="Lock All" />
                    <IconButton styles={styles} icon={Unlock} onClick={() => onPaletteAction.toggleAllLocks(false)} title="Unlock All" />
                    <div className={`w-px h-3 mx-1.5 ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`}></div>
                    <IconButton styles={styles} icon={FolderOpen} onClick={() => paletteImportRef.current?.click()} title="Import Palette File" />
                    <input type="file" ref={paletteImportRef} className="hidden" accept=".json,.hex,.gpl" onChange={onPaletteAction.import} />
                    <div className="relative">
                        <IconButton styles={styles} icon={Save} onClick={() => setShowExportMenu(!showExportMenu)} title="Export Palette" />
                        {showExportMenu && (
                            <div className={`absolute top-full left-0 mt-1 w-24 text-xs shadow-xl z-50 flex flex-col border ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                {['hex', 'json', 'gpl'].map(fmt => <button key={fmt} onClick={() => { onPaletteAction.export(fmt); setShowExportMenu(false); }} className={`px-3 py-2 text-left uppercase transition-colors ${isDark ? 'text-neutral-300 hover:bg-neutral-700' : 'text-neutral-700 hover:bg-neutral-100'}`}>{fmt}</button>)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-0.5 items-center">
                    <IconButton styles={styles} icon={Library} onClick={() => onPaletteAction.openLibrary()} title="Palette Library" />
                    <IconButton styles={styles} icon={ImageIcon} onClick={() => extractInputRef.current?.click()} title="Extract from Frame" />
                    <input type="file" ref={extractInputRef} className="hidden" accept="image/*" onChange={(e) => onPaletteAction.extractFromImage(e.target.files?.[0])} />
                    <IconButton styles={styles} icon={RefreshCw} onClick={() => updateSetting('genSeed', s => s + 1)} title="Reseed Auto-Extraction" />
                </div>
            </div>
            <div className="flex justify-between items-center">
                <span className="text-xs font-bold uppercase text-neutral-500">Color Count</span>
                <StepperInput styles={styles} isDark={isDark} value={tempColorCount} onChange={(e) => setTempColorCount(e.target.value)} onBlur={() => applyColorCount(tempColorCount)} onKeyDown={(e) => e.key === 'Enter' && applyColorCount(tempColorCount)} onDecrease={() => applyColorCount(settings.paletteSize - 1)} onIncrease={() => applyColorCount(settings.paletteSize + 1)} />
            </div>
            <div className={styles.segmentGroup}>{[2, 4, 8, 16, 32, 64, 128, 256].map(p => <button key={p} onClick={() => applyColorCount(p)} className={styles.segmentButton(settings.paletteSize === p)}>{p}</button>)}</div>
            <div className="grid grid-cols-10 gap-0.5 max-h-40 overflow-y-auto custom-scrollbar">
                {paletteData.displayed.map((color, i) => (
                    <div key={color.id || i} onClick={(e) => onPaletteAction.clickSwatch(color.id, e)} className={`aspect-square border cursor-pointer relative ${color.locked ? 'ring-1 ring-inset ring-white/50 border-neutral-900' : 'border-transparent'}`} style={{ backgroundColor: rgbToHex(color.displayR, color.displayG, color.displayB) }}>
                        {color.locked && <div className="absolute inset-0 flex items-center justify-center opacity-30"><Lock size={8} className="text-white" /></div>}
                    </div>
                ))}
            </div>
        </PanelSection>
    );
};

const DITHER_CATEGORIES = {
    'bayer': 'pattern', 'halftone': 'pattern', 'blue-noise': 'pattern',
    'floyd': 'flow', 'atkinson': 'flow', 'sierra': 'flow', 'sierra-lite': 'flow', 'stucki': 'flow', 'burkes': 'flow', 'ostromoukhov': 'flow', 'riemersma': 'flow',
    'knoll': 'geometric', 'n-closest': 'geometric', 'n-convex': 'geometric', 'fw-dither': 'geometric',
    'best-match': 'analytical', 'linear-projection': 'analytical'
};

const DitheringPanel = ({ styles, isDark, settings, updateSetting, paletteData, onPaletteAction }) => {
    const handleMethodChange = (e) => { const method = e.target.value; updateSetting('ditherSubMethod', method); updateSetting('ditherCategory', DITHER_CATEGORIES[method]); };
    return (
        <PanelSection styles={styles} title="Dithering">
            <div className="flex gap-2">
                <Select styles={styles} value={settings.ditherSubMethod} onChange={handleMethodChange} optgroups={{
                    "Ordered": [ {value: 'bayer', label: 'Bayer (Dispersed)'}, {value: 'halftone', label: 'Halftone (Clustered)'}, {value: 'blue-noise', label: 'Blue Noise'} ],
                    "Diffusion": [ {value: 'floyd', label: 'Floyd-Steinberg'}, {value: 'atkinson', label: 'Atkinson'}, {value: 'sierra', label: 'Sierra (3-row)'}, {value: 'sierra-lite', label: 'Sierra Lite'}, {value: 'stucki', label: 'Stucki'}, {value: 'burkes', label: 'Burkes'}, {value: 'ostromoukhov', label: 'Ostromoukhov'}, {value: 'riemersma', label: 'Riemersma'} ],
                    "Geometric": [ {value: 'knoll', label: 'Thomas Knoll'}, {value: 'n-closest', label: "N-Closest (Shepard's)"}, {value: 'n-convex', label: 'N-Convex'}, {value: 'fw-dither', label: 'Linear Projection (NNLS)'} ],
                    "No Dither": [ {value: 'best-match', label: 'Best Match'}, {value: 'linear-projection', label: 'Linear Projection'} ]
                }} />
                {settings.ditherCategory === 'flow' && settings.ditherSubMethod !== 'riemersma' && <IconButton styles={styles} icon={WrapText} onClick={() => updateSetting('serpentine', !settings.serpentine)} title="Serpentine Scanning" className={`border ${settings.serpentine ? (isDark ? 'bg-neutral-800 border-neutral-400' : 'bg-neutral-200 border-neutral-400') : 'border-neutral-300 dark:border-neutral-700'}`} />}
                {settings.ditherCategory === 'pattern' && settings.ditherSubMethod === 'halftone' && paletteData.displayed.some(c => c.locked) && <IconButton styles={styles} icon={Dices} onClick={() => onPaletteAction.randomizeOffsets()} title="Randomize All Offsets" className={`border border-neutral-300 dark:border-neutral-700`} />}
                {settings.ditherCategory === 'geometric' && settings.ditherSubMethod === 'knoll' && <IconButton styles={styles} icon={Dices} onClick={() => updateSetting('ditherSeed', (settings.ditherSeed || 0) + 1)} title="Reseed Pattern" className="border border-neutral-300 dark:border-neutral-700" />}
            </div>
            {settings.ditherCategory === 'flow' && settings.ditherSubMethod === 'riemersma' && <div><div className="flex justify-between text-xs font-bold text-neutral-400 mb-1.5"><span>CURVE HISTORY (L)</span><span>{settings.riemersmaHistory}</span></div><RangeSlider styles={styles} min={4} max={64} step={4} value={settings.riemersmaHistory} onChange={(e) => updateSetting('riemersmaHistory', Number(e.target.value))} /></div>}
            {settings.ditherCategory === 'pattern' && settings.ditherSubMethod !== 'blue-noise' && <div className={styles.segmentGroup}>{[2, 4, 8, 16, 32].map(s => (<button key={s} onClick={() => updateSetting('bayerSize', s)} className={styles.segmentButton(settings.bayerSize === s)}>{s}x</button>))}</div>}
            {settings.ditherCategory === 'geometric' && settings.ditherSubMethod !== 'fw-dither' && <div><div className="flex justify-between text-xs font-bold text-neutral-400 mb-1.5"><span>CANDIDATES (N)</span><span>{settings.nCandidates}</span></div><RangeSlider styles={styles} min={2} max={16} step={1} value={settings.nCandidates} onChange={(e) => updateSetting('nCandidates', Number(e.target.value))} /></div>}
            {settings.ditherCategory === 'geometric' && (settings.ditherSubMethod === 'n-closest' || settings.ditherSubMethod === 'n-convex') && <div><div className="flex justify-between text-xs font-bold text-neutral-400 mb-1.5"><span>DISTANCE EXPONENT (s)</span><span>{settings.distanceExponent}</span></div><RangeSlider styles={styles} min={0.5} max={5} step={0.5} value={settings.distanceExponent} onChange={(e) => updateSetting('distanceExponent', Number(e.target.value))} /></div>}
            {settings.ditherCategory !== 'analytical' && <div className="pt-1"><div className="flex justify-between text-xs font-bold text-neutral-400 mb-1.5"><span>INTENSITY / SPREAD</span><span>{Math.round(settings.dithering * 100)}%</span></div><RangeSlider styles={styles} min={0} max={1} step={0.05} value={settings.dithering} onChange={(e) => updateSetting('dithering', Number(e.target.value))} /></div>}
        </PanelSection>
    );
};

const ColorEditor = ({ color, onClose, position, onUpdateLogic, onUpdatePaint, onToggleLock, isLinked, onToggleLink, onUpdateOffset, styles, isDark, settings }) => {
    if (!color) return null;
    const logicHex = rgbToHex(color.r, color.g, color.b); const paintHex = rgbToHex(color.displayR, color.displayG, color.displayB);
    return (
        <div className={styles.popover} style={{ top: position.top, left: position.left, width: '13rem' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-neutral-400 uppercase">Edit Color</span><button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={14} /></button></div>
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col items-center gap-1"><div className="relative w-12 h-12 border overflow-hidden shadow-inner"><div className="absolute inset-0" style={{background: logicHex}}></div><input type="color" value={logicHex} onChange={(e) => onUpdateLogic(color.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></div><span className="text-xs text-neutral-500">{logicHex}</span></div>
                <button onClick={onToggleLink} className={isLinked ? 'text-neutral-400' : 'text-neutral-200'}>{isLinked ? <LinkIcon size={14} /> : <Unlink size={14} />}</button>
                <div className="flex flex-col items-center gap-1"><div className="relative w-12 h-12 border overflow-hidden shadow-inner"><div className="absolute inset-0" style={{background: paintHex}}></div><input type="color" value={paintHex} onChange={(e) => onUpdatePaint(color.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></div><span className="text-xs text-neutral-500">{paintHex}</span></div>
            </div>
            <div className={styles.divider}></div>
            {color.locked && settings.ditherCategory === 'pattern' && (
                <div className="flex flex-col gap-1 mb-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-neutral-400 uppercase">Pattern Offset</span>
                        {settings.ditherSubMethod === 'halftone' && <button onClick={() => onUpdateOffset(color.id, Math.floor(Math.random() * 32), Math.floor(Math.random() * 32))} className={`hover:text-neutral-900 transition-colors ${isDark ? 'text-neutral-500 dark:hover:text-white' : 'text-neutral-400'}`} title="Randomize Offset"><Dices size={12} /></button>}
                    </div>
                    <div className="flex gap-2">
                        <NumberInput label="X" value={color.offsetX || 0} onChange={e => onUpdateOffset(color.id, e.target.value, undefined)} styles={styles} />
                        <NumberInput label="Y" value={color.offsetY || 0} onChange={e => onUpdateOffset(color.id, undefined, e.target.value)} styles={styles} />
                    </div>
                </div>
            )}
            <button onClick={(e) => onToggleLock(color.id, e)} className={`w-full py-1.5 text-xs font-bold uppercase transition-all ${color.locked ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-600'}`}>{color.locked ? 'Locked' : 'Unlocked'}</button>
        </div>
    );
};

const FloatingToolbar = ({ styles, isDark, zoom, setZoom, isComparing, onCompareStart, onCompareEnd, onCenter, onOneToOne, onFit, onDownload, isAnimation, isGif, gifTotalFrames, gifCurrentFrame, onSeekGif, onRenderGif, isVideo, videoDuration, videoCurrentTime, onSeekVideo, onRenderVideo, settings }) => {
    const [tempInput, setTempInput] = useState('100');
    useEffect(() => { setTempInput(Math.round(zoom * 100).toString()); }, [zoom]);

    const handleBlur = () => { const val = parseFloat(tempInput); if (!isNaN(val) && val > 0) setZoom(val / 100); else setTempInput(Math.round(zoom * 100).toString()); };

    const getNextSnap = (current, direction) => {
        const isZoomIn = direction > 0; const epsilon = 0.001; let newScale;
        if (isZoomIn) { 
            if (current >= 1) newScale = Math.floor(current + epsilon) + 1; 
            else newScale = Math.pow(2, Math.floor(Math.log2(current) + epsilon) + 1); 
        } else {
            if (current > 1) {
                newScale = Math.ceil(current - epsilon) - 1;
                if (newScale < 1) newScale = 0.5;
            } else newScale = Math.pow(2, Math.ceil(Math.log2(current) - epsilon) - 1);
        }
        return Math.min(Math.max(newScale, 0.015625), 64);
    };

    const VIDEO_FPS = settings?.videoFps || 30;
    const totalFrames = isGif ? gifTotalFrames : Math.floor((videoDuration || 0) * VIDEO_FPS);
    const currentFrame = isGif ? gifCurrentFrame : Math.floor((videoCurrentTime || 0) * VIDEO_FPS);

    return (
        <div className={`${styles.toolbar} flex flex-col gap-1.5 ${isAnimation ? 'w-[96%] max-w-2xl p-2' : 'px-3 py-1.5'}`}>
            <div className={`flex items-center justify-center gap-1 w-full`}>
                 <IconButton onClick={() => setZoom(getNextSnap(zoom, -1))} icon={ZoomOut} styles={styles} />
                 <div className="relative flex items-center justify-center">
                   <input type="text" value={tempInput} onChange={(e) => setTempInput(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()} className="w-10 bg-transparent text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-neutral-500 px-0.5" />
                   <span className="text-xs font-bold opacity-50">%</span>
                 </div>
                 <IconButton onClick={() => setZoom(getNextSnap(zoom, 1))} icon={ZoomIn} styles={styles} />
                 <div className={`w-px h-3 mx-1 ${isDark ? 'bg-neutral-700' : 'bg-neutral-300'}`}></div>
                 <button onPointerDown={onCompareStart} onPointerUp={onCompareEnd} onMouseLeave={onCompareEnd} className={`${styles.buttonGhost} ${isComparing ? (isDark ? 'text-white bg-neutral-800' : 'text-neutral-900 bg-neutral-100') : ''}`} title="Hold to Compare"><Eye size={14} /></button>
                 <IconButton onClick={onCenter} icon={Focus} title="Center Image" styles={styles} />
                 <IconButton onClick={onOneToOne} icon={Maximize2} title="1:1 (100%)" styles={styles} />
                 <IconButton onClick={onFit} icon={Minimize} title="Fit to Viewport" styles={styles} />
                 <IconButton onClick={onDownload} icon={isAnimation ? ImageIcon : Download} title={isAnimation ? "Download Rendered Frame" : "Download Render"} styles={styles} />
            </div>

            {isAnimation && (
                <div className={`flex items-center gap-3 w-full pt-1.5 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <button onClick={isGif ? onRenderGif : onRenderVideo} className={`px-3 py-1.5 transition-colors flex items-center justify-center gap-1.5 font-bold text-xs uppercase border ${isDark ? 'bg-transparent border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white' : 'bg-transparent border-neutral-300 text-neutral-600 hover:bg-neutral-100 hover:text-black'}`}>
                        <Film size={12} /> Render
                    </button>
                    <span className="text-xs font-mono text-neutral-400 min-w-[3ch] text-right">{currentFrame}</span>
                    <RangeSlider min={0} max={totalFrames ? totalFrames - 1 : 1} step={1} value={currentFrame} onChange={(e) => isGif ? onSeekGif(Number(e.target.value)) : onSeekVideo(Number(e.target.value) / VIDEO_FPS)} styles={styles} className="flex-1" />
                    <span className="text-xs font-mono text-neutral-400 min-w-[3ch]">{totalFrames}</span>
                </div>
            )}
        </div>
    );
};

// ==========================================
// 6. MAIN APPLICATION & STATE
// ==========================================

export default function App() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)'); setIsDark(mediaQuery.matches);
    const handler = (e) => setIsDark(e.matches); mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Dynamically load omggif
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.GifReader) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/omggif@1.0.10/omggif.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const styles = useMemo(() => getThemeStyles(isDark), [isDark]);

  const [imageSrc, setImageSrc] = useState(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isGif, setIsGif] = useState(false);
  const [gifTotalFrames, setGifTotalFrames] = useState(0);
  const [gifCurrentFrame, setGifCurrentFrame] = useState(0);

  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderPhase, setRenderPhase] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Processing...');
  const [settings, setSettings] = useState({
      width: 128, height: 128, aspectRatio: 1,
      colorSpace: 'oklab', matchMethod: 'euclidean', manualWeights: { r: 0.21, g: 0.72, b: 0.07 },
      paletteSize: 4, contrastAnchoring: false, genSeed: 0, sortMode: 'impact',
      ditherCategory: 'pattern', ditherSubMethod: 'bayer', dithering: 0.15, bayerSize: 2, 
      serpentine: false, nCandidates: 4, distanceExponent: 2.0, riemersmaHistory: 16, ditherSeed: 0,
      videoFps: 30
  });

  const updateSetting = useCallback((key, value) => { setSettings(prev => ({ ...prev, [key]: value })); }, []);

  const [activePalette, setActivePalette] = useState([]); 
  const [sourceVersion, setSourceVersion] = useState(0); 
  const [recalcTrigger, setRecalcTrigger] = useState(0); 
  const [isComparing, setIsComparing] = useState(false);
  const [pickerOpenId, setPickerOpenId] = useState(null); 
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 }); 
  const [isColorsLinked, setIsColorsLinked] = useState(true); 
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0, isFit: true });
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Magic fix for Canvas downscaling noise: Use actual Blob URLs for smooth browser mipmapping
  const [previewUrls, setPreviewUrls] = useState({ original: null, dithered: null });
  const blobCounterRef = useRef({ original: 0, dithered: 0 });

  const sourceDataRef = useRef(null); 
  const canvasRef = useRef(null); 
  const hiddenCanvasRef = useRef(null);
  const originalPixelCanvasRef = useRef(null);
  const videoRef = useRef(null);
  const gifFramesRef = useRef([]);
  
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const lastSourceInfoRef = useRef({ w: 0, h: 0 }); 
  const containerRef = useRef(null); 
  const activePaletteRef = useRef([]);
  const touchState = useRef({ initialDist: 0, initialScale: 1 });
  useEffect(() => { activePaletteRef.current = activePalette; }, [activePalette]);

  const extractFrameFromSource = useCallback((sourceEl) => {
      if (!hiddenCanvasRef.current) return;
      const ctx = hiddenCanvasRef.current.getContext('2d');
      hiddenCanvasRef.current.width = settingsRef.current.width; 
      hiddenCanvasRef.current.height = settingsRef.current.height;
      
      const sourceW = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width || 0;
      ctx.imageSmoothingEnabled = sourceW > settingsRef.current.width;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(sourceEl, 0, 0, settingsRef.current.width, settingsRef.current.height);
      const data = ctx.getImageData(0, 0, settingsRef.current.width, settingsRef.current.height);
      
      if (originalPixelCanvasRef.current) {
          originalPixelCanvasRef.current.width = settingsRef.current.width;
          originalPixelCanvasRef.current.height = settingsRef.current.height;
          const oCtx = originalPixelCanvasRef.current.getContext('2d');
          oCtx.putImageData(data, 0, 0);
          
          // Generate a real image Blob to bypass canvas downscaling noise
          const currentId = ++blobCounterRef.current.original;
          originalPixelCanvasRef.current.toBlob(blob => {
              if (currentId !== blobCounterRef.current.original) return;
              if (blob) {
                  const url = URL.createObjectURL(blob);
                  setPreviewUrls(prev => {
                      if (prev.original) URL.revokeObjectURL(prev.original);
                      return { ...prev, original: url };
                  });
              }
          });
      }

      sourceDataRef.current = { width: settingsRef.current.width, height: settingsRef.current.height, pixels: data.data }; 
      setSourceVersion(v => v + 1);
  }, []);

  const processGifBuffer = async (buffer) => {
      if (!window.GifReader) { alert("GIF library still loading, please try again."); return; }
      const uint8Array = new Uint8Array(buffer);
      const reader = new window.GifReader(uint8Array);
      const w = reader.width; const h = reader.height;
      const frameCount = reader.numFrames();
      
      lastSourceInfoRef.current = { w, h };
      const ar = w / h;
      const initialWidth = Math.min(w, 360);
      setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: Math.round(initialWidth / ar) }));
      
      const frames = [];
      let prevCanvas = null;
      for (let i = 0; i < frameCount; i++) {
          const frameInfo = reader.frameInfo(i);
          const frameCanvas = document.createElement('canvas');
          frameCanvas.width = w; frameCanvas.height = h;
          const fCtx = frameCanvas.getContext('2d');
          
          if (i > 0) {
              const prevInfo = reader.frameInfo(i - 1);
              if (prevInfo.disposal !== 2 && prevCanvas) {
                  fCtx.drawImage(prevCanvas, 0, 0);
              }
          }
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = w; tempCanvas.height = h;
          const tempCtx = tempCanvas.getContext('2d');
          const imageData = tempCtx.createImageData(w, h);
          reader.decodeAndBlitFrameRGBA(i, imageData.data);
          tempCtx.putImageData(imageData, 0, 0);
          fCtx.drawImage(tempCanvas, 0, 0);
          
          frames.push({ canvas: frameCanvas, delay: frameInfo.delay || 10, disposal: frameInfo.disposal || 0 });
          prevCanvas = frameCanvas;
      }
      
      gifFramesRef.current = frames;
      setIsGif(true);
      setIsVideo(false);
      setGifTotalFrames(frameCount);
      setGifCurrentFrame(0);
      setViewState(v => ({ ...v, isFit: true }));
      // Wait for next tick to ensure settings propagation before extracting
      setTimeout(() => extractFrameFromSource(frames[0].canvas), 50);
  };

  const processImageFile = useCallback((file, type = 'main') => {
    if (!file) return;
    setLoading(true);
    setLoadingMsg('Processing Media...');
    
    const isVid = file.type.startsWith('video/');
    const isGifFile = file.type === 'image/gif';

    const url = URL.createObjectURL(file);
    
    if (type === 'main') {
        if (isGifFile) {
            setLoadingMsg('Decoding GIF frames...');
            const reader = new FileReader();
            reader.onload = async (e) => {
                await processGifBuffer(e.target.result);
                setImageSrc(url); 
                setLoading(false);
            };
            reader.readAsArrayBuffer(file);
            return;
        } else {
            setIsVideo(isVid);
            setIsGif(false);
            if (isVid) { setImageSrc(url); setLoading(false); return; }
        }
    }

    const img = new Image();
    img.onload = () => {
      if (type === 'main') {
          const ar = img.width / img.height;
          lastSourceInfoRef.current = { w: img.width, h: img.height };
          const initialWidth = Math.min(img.width, 360);
          const initialHeight = Math.round(initialWidth / ar);
          setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: initialHeight })); 
          setImageSrc(img.src); 
          setViewState(v => ({ ...v, isFit: true }));
          setTimeout(() => extractFrameFromSource(img), 0);
      } else if (type === 'palette') {
          const canv = document.createElement('canvas'); canv.width = 128; canv.height = 128;
          const ctx = canv.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
          const data = ctx.getImageData(0, 0, 128, 128);
          const np = extractPaletteHull(data.data, settings.paletteSize, settings, activePaletteRef.current.filter(c => c.locked));
          setActivePalette(sortPalette(np, settings.sortMode));
      }
      setLoading(false);
    };
    img.src = url;
  }, [settings.paletteSize, settings.sortMode, extractFrameFromSource]);

  useEffect(() => {
    if (!imageSrc || !hiddenCanvasRef.current || isGif) return;
    if (isVideo && videoRef.current) extractFrameFromSource(videoRef.current);
    else if (!isVideo) { const img = new Image(); img.src = imageSrc; img.onload = () => extractFrameFromSource(img); }
  }, [imageSrc, settings.width, settings.height, isVideo, isGif, extractFrameFromSource]);

  useEffect(() => {
    if (isGif && gifFramesRef.current[gifCurrentFrame]) {
        extractFrameFromSource(gifFramesRef.current[gifCurrentFrame].canvas);
    }
  }, [settings.width, settings.height, isGif, gifCurrentFrame, extractFrameFromSource]);

  useEffect(() => {
    if (!sourceDataRef.current || isRenderingVideo) return;
    const timer = setTimeout(() => {
        const locked = activePaletteRef.current.filter(c => c.locked);
        const np = extractPaletteHull(sourceDataRef.current.pixels, settings.paletteSize, settings, locked);
        setActivePalette(sortPalette(np, settings.sortMode));
    }, 50);
    return () => clearTimeout(timer);
  }, [sourceVersion, settings.paletteSize, settings.contrastAnchoring, settings.colorSpace, settings.genSeed, settings.sortMode, recalcTrigger, isRenderingVideo]);

  useEffect(() => {
    if (!sourceDataRef.current || !canvasRef.current || activePalette.length === 0 || isRenderingVideo) return;
    const timer = setTimeout(() => {
        renderDitheredImage(canvasRef.current, sourceDataRef.current, activePalette, settings);
        
        // Generate a real image Blob to bypass canvas downscaling noise
        const currentId = ++blobCounterRef.current.dithered;
        canvasRef.current.toBlob(blob => {
            if (currentId !== blobCounterRef.current.dithered) return;
            if (blob) {
                const url = URL.createObjectURL(blob);
                setPreviewUrls(prev => {
                    if (prev.dithered) URL.revokeObjectURL(prev.dithered);
                    return { ...prev, dithered: url };
                });
            }
        });
    }, 10);
    return () => clearTimeout(timer);
  }, [activePalette, sourceVersion, settings, isRenderingVideo]);

  const handleVideoSeek = (time) => { setVideoCurrentTime(time); if (videoRef.current) videoRef.current.currentTime = time; };

  const handleGifSeek = (frameIdx) => {
      setGifCurrentFrame(frameIdx);
      if (gifFramesRef.current[frameIdx]) {
          extractFrameFromSource(gifFramesRef.current[frameIdx].canvas);
      }
  };

  const handleRenderGif = async () => {
      if (!window.GifWriter || gifFramesRef.current.length === 0) return;
      setIsRenderingVideo(true); setRenderPhase('Encoding Custom GIF'); setRenderProgress(0);
      
      const w = settingsRef.current.width; const h = settingsRef.current.height;
      const frames = gifFramesRef.current;
      
      // Directly translate active specific Palette to GIF Palette
      const customPalette = activePaletteRef.current.map(c => (c.displayR << 16) | (c.displayG << 8) | c.displayB);
      const transparentIndex = customPalette.length;
      
      // Pad palette to power of 2
      let targetLen = 2;
      while (targetLen < customPalette.length + 1 && targetLen <= 256) targetLen <<= 1;
      const paletteToUse = [...customPalette, 0x000000];
      while (paletteToUse.length < targetLen) paletteToUse.push(0);
      
      const colorCache = new Map();
      customPalette.forEach((c, i) => colorCache.set(c, i));

      // Overestimate buffer to prevent capacity issues
      const bufSize = Math.max(1024 * 1024 * 5, 1024 + (frames.length * w * h * 3));
      const buffer = new Uint8Array(bufSize);
      const writer = new window.GifWriter(buffer, w, h, { loop: 0 });
      
      for (let i = 0; i < frames.length; i++) {
          extractFrameFromSource(frames[i].canvas);
          renderDitheredImage(canvasRef.current, sourceDataRef.current, activePaletteRef.current, settingsRef.current);
          
          const ctx = canvasRef.current.getContext('2d');
          const rgba = ctx.getImageData(0, 0, w, h).data;
          const indexedPixels = new Uint8Array(w * h);
          let hasTransparency = false;
          
          for (let p = 0; p < rgba.length; p += 4) {
              if (rgba[p+3] < 128) {
                  indexedPixels[p/4] = transparentIndex;
                  hasTransparency = true;
              } else {
                  const rgb = (rgba[p] << 16) | (rgba[p+1] << 8) | rgba[p+2];
                  let idx = colorCache.get(rgb);
                  if (idx === undefined) {
                      let minDist = Infinity;
                      for (let j = 0; j < customPalette.length; j++) {
                          const dr = rgba[p] - ((customPalette[j] >> 16) & 255);
                          const dg = rgba[p+1] - ((customPalette[j] >> 8) & 255);
                          const db = rgba[p+2] - (customPalette[j] & 255);
                          const dist = dr*dr + dg*dg + db*db;
                          if (dist < minDist) { minDist = dist; idx = j; }
                      }
                      colorCache.set(rgb, idx);
                  }
                  indexedPixels[p/4] = idx;
              }
          }
          
          const options = {
              palette: paletteToUse,
              delay: Math.max(2, Math.round(frames[i].delay / 10)),
              disposal: frames[i].disposal || 1
          };
          if (hasTransparency) options.transparent = transparentIndex;
          
          writer.addFrame(0, 0, w, h, indexedPixels, options);
          setRenderProgress((i + 1) / frames.length);
          await new Promise(r => setTimeout(r, 0));
      }
      
      const finalBuffer = buffer.slice(0, writer.end());
      const blob = new Blob([finalBuffer], { type: 'image/gif' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = 'dithered-animation.gif'; link.click();
      
      setIsRenderingVideo(false); setRenderPhase('');
  };

  const handleRenderVideo = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      setIsRenderingVideo(true); setRenderPhase('Extracting Frames'); setRenderProgress(0);
      
      const video = videoRef.current;
      const VIDEO_FPS = settingsRef.current.videoFps || 30;
      const totalFrames = Math.floor(videoDuration * VIDEO_FPS);
      const renderedFrames = [];
      video.onseeked = null;

      for (let i = 0; i < totalFrames; i++) {
          video.currentTime = i / VIDEO_FPS;
          await new Promise(r => { const handler = () => { video.removeEventListener('seeked', handler); r(); }; video.addEventListener('seeked', handler); });
          extractFrameFromSource(video);
          renderDitheredImage(canvasRef.current, sourceDataRef.current, activePaletteRef.current, settingsRef.current);
          const bitmap = await createImageBitmap(canvasRef.current);
          renderedFrames.push(bitmap);
          setRenderProgress((i + 1) / totalFrames);
          await new Promise(r => setTimeout(r, 0)); 
      }
      
      setRenderPhase('Encoding Video'); setRenderProgress(0);
      const stream = canvasRef.current.captureStream(VIDEO_FPS);
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      
      const recordingPromise = new Promise(resolve => {
          recorder.onstop = () => {
              const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url;
              const extension = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
              a.download = `dithered-video.${extension}`; a.click(); resolve();
          };
      });
      
      const ctx = canvasRef.current.getContext('2d');
      ctx.drawImage(renderedFrames[0], 0, 0); recorder.start();
      const frameDurationMs = 1000 / VIDEO_FPS; let startTime = performance.now(); let frameIdx = 0;
      
      const playNextFrame = (timestamp) => {
          const elapsed = timestamp - startTime;
          const targetFrame = Math.floor(elapsed / frameDurationMs);
          if (targetFrame > frameIdx && targetFrame < totalFrames) {
              frameIdx = targetFrame; ctx.drawImage(renderedFrames[frameIdx], 0, 0); setRenderProgress(frameIdx / totalFrames);
          }
          if (frameIdx < totalFrames - 1) requestAnimationFrame(playNextFrame);
          else setTimeout(() => recorder.stop(), frameDurationMs);
      };
      
      requestAnimationFrame(playNextFrame); await recordingPromise;
      renderedFrames.forEach(bmp => bmp.close && bmp.close());
      setIsRenderingVideo(false); setRenderPhase('');
      
      video.onseeked = (e) => { if (isRenderingVideo) return; setVideoCurrentTime(e.target.currentTime); extractFrameFromSource(e.target); };
      video.currentTime = videoCurrentTime;
  };

  const resetView = useCallback(() => {
      if (containerRef.current) {
          const cw = containerRef.current.clientWidth, ch = containerRef.current.clientHeight;
          const scale = Math.min((cw * 0.9) / settings.width, (ch * 0.9) / settings.height, 8);
          setViewState(v => ({ ...v, scale, x: 0, y: 0 }));
      }
  }, [settings.width, settings.height]);

  useEffect(() => { if (viewState.isFit) resetView(); }, [settings.width, settings.height, viewState.isFit, resetView]);

  const updateColor = (id, hex, mode) => {
      const [r, g, b] = hexToRgb(hex); const newPalette = [...activePaletteRef.current];
      const idx = newPalette.findIndex(c => c.id === id); if (idx === -1) return;
      const c = newPalette[idx];
      if (mode === 'logic') { c.r = r; c.g = g; c.b = b; delete c.transformed; if (isColorsLinked) { c.displayR = r; c.displayG = g; c.displayB = b; } }
      else { c.displayR = r; c.displayG = g; c.displayB = b; if (isColorsLinked) { c.r = r; c.g = g; c.b = b; delete c.transformed; } }
      c.locked = true; setActivePalette(sortPalette(newPalette, settings.sortMode)); setRecalcTrigger(n => n + 1);
  };

  const updateColorOffset = useCallback((id, ox, oy) => {
      setActivePalette(prev => prev.map(c => {
          if (c.id !== id) return c;
          const newC = { ...c };
          if (ox !== undefined) newC.offsetX = parseInt(ox) || 0;
          if (oy !== undefined) newC.offsetY = parseInt(oy) || 0;
          return newC;
      }));
  }, []);

  const handlePaletteImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result; const hexMatches = text.match(/#[0-9A-Fa-f]{6}/g);
      if (hexMatches && hexMatches.length > 0) {
          const newPalette = hexMatches.map((hex, i) => {
              const [r, g, b] = hexToRgb(hex);
              return { r, g, b, displayR: r, displayG: g, displayB: b, offsetX: 0, offsetY: 0, locked: true, isNew: true, id: generateId(), impactIndex: i };
          });
          const capped = newPalette.slice(0, 256); setActivePalette(capped); setSettings(s => ({ ...s, paletteSize: capped.length })); setRecalcTrigger(n => n + 1);
      } else { alert("No valid hex codes found."); }
    };
    reader.readAsText(file); e.target.value = null;
  };

  const handlePaletteExport = (format) => {
      if (activePalette.length === 0) return;
      let content = "", mimeType = "text/plain", extension = "txt";
      if (format === 'hex') { content = activePalette.map(c => rgbToHex(c.displayR, c.displayG, c.displayB)).join('\n'); extension = "hex"; } 
      else if (format === 'json') { content = JSON.stringify(activePalette.map(c => rgbToHex(c.displayR, c.displayG, c.displayB)), null, 2); mimeType = "application/json"; extension = "json"; } 
      else if (format === 'gpl') {
          content = "GIMP Palette\nName: Micah's Colors Palette\nColumns: 4\n#\n";
          activePalette.forEach(c => { const hex = rgbToHex(c.displayR, c.displayG, c.displayB); content += `${c.displayR} ${c.displayG} ${c.displayB} ${hex}\n`; });
          extension = "gpl";
      }
      const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.download = `palette.${extension}`; link.href = url; link.click();
  };

  const handleApplyPreset = (hexColors) => {
      const newPalette = hexColors.map((hex, i) => { const [r, g, b] = hexToRgb(hex); return { r, g, b, displayR: r, displayG: g, displayB: b, offsetX: 0, offsetY: 0, locked: true, isNew: false, id: generateId(), impactIndex: i }; });
      setActivePalette(newPalette); setSettings(s => ({ ...s, paletteSize: newPalette.length })); setRecalcTrigger(n => n + 1); setIsLibraryOpen(false);
  };

  const [dragStart, setDragStart] = useState(null); const [isPanning, setIsPanning] = useState(false);
  const handleMouseDown = (e) => { if (imageSrc) { setIsPanning(true); setDragStart({ x: e.clientX - viewState.x, y: e.clientY - viewState.y }); setViewState(v => ({ ...v, isFit: false })); }};
  const handleMouseMove = (e) => { if (isPanning) setViewState(v => ({ ...v, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })); };

  const handleTouchStart = (e) => {
      if (!imageSrc) return;
      if (e.touches.length === 1) { setIsPanning(true); setDragStart({ x: e.touches[0].clientX - viewState.x, y: e.touches[0].clientY - viewState.y }); setViewState(v => ({ ...v, isFit: false })); } 
      else if (e.touches.length === 2) { setIsPanning(false); const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; touchState.current.initialDist = Math.hypot(dx, dy); touchState.current.initialScale = viewState.scale; }
  };
  const handleTouchMove = (e) => {
      if (!imageSrc) return;
      if (e.touches.length === 1 && isPanning) setViewState(v => ({ ...v, x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }));
      else if (e.touches.length === 2) { const dx = e.touches[0].clientX - e.touches[1].clientX; const dy = e.touches[0].clientY - e.touches[1].clientY; const dist = Math.hypot(dx, dy); if (touchState.current.initialDist > 0) { const newScale = clamp(touchState.current.initialScale * (dist / touchState.current.initialDist), 0.015625, 64); setViewState(v => ({ ...v, scale: newScale, isFit: false })); } }
  };
  const handleTouchEnd = (e) => {
      if (e.touches.length < 2) touchState.current.initialDist = 0;
      if (e.touches.length === 0) setIsPanning(false);
      else if (e.touches.length === 1) { setDragStart({ x: e.touches[0].clientX - viewState.x, y: e.touches[0].clientY - viewState.y }); setIsPanning(true); }
  };

  return (
    <div className={styles.appContainer} onClick={() => setPickerOpenId(null)}>
      {(isRenderingVideo || loading) && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-neutral-950/90 backdrop-blur-sm text-white">
              <RefreshCw className="w-10 h-10 animate-spin mb-6 text-neutral-400" />
              <span className="text-sm font-bold uppercase tracking-widest mb-2">{isRenderingVideo ? renderPhase : loadingMsg}</span>
              {isRenderingVideo && (
                  <>
                    <div className="w-64 h-1.5 bg-neutral-800 mt-2"><div className="h-full bg-white transition-all duration-200" style={{ width: `${Math.max(0, renderProgress) * 100}%` }}></div></div>
                    <span className="text-xs font-bold tracking-widest mt-3 text-neutral-400">{Math.round(renderProgress * 100)}%</span>
                  </>
              )}
          </div>
      )}

      <div className={styles.panel}>
          <div className={styles.panelHeader}>
              <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-neutral-500" />
                  <h1 className={styles.heading}>Micah's Colors</h1>
              </div>
              <IconButton styles={styles} icon={FolderOpen} onClick={() => document.getElementById('main-upload')?.click()} title="Open Media" />
              <input type="file" id="main-upload" className="hidden" accept="image/*,video/*,image/gif" onChange={(e) => processImageFile(e.target.files?.[0])} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-6">
              <ImageSetupPanel styles={styles} isDark={isDark} settings={settings} updateSetting={updateSetting} imageLoaded={!!imageSrc} onResetOriginalSize={() => setSettings(s => ({...s, width: lastSourceInfoRef.current.w, height: lastSourceInfoRef.current.h}))} isAnimation={isVideo || isGif} isVideo={isVideo} />
              <div className={styles.divider}></div>
              <PalettePanel styles={styles} isDark={isDark} settings={settings} updateSetting={updateSetting} paletteData={{ displayed: activePalette }} onPaletteAction={{ extractFromImage: (file) => processImageFile(file, 'palette'), toggleAllLocks: (locked) => { setActivePalette(prev => prev.map(c => ({...c, locked}))); setRecalcTrigger(n => n + 1); }, openLibrary: () => setIsLibraryOpen(true), import: handlePaletteImport, export: handlePaletteExport, randomizeOffsets: () => { setActivePalette(prev => prev.map(c => c.locked ? { ...c, offsetX: Math.floor(Math.random() * 32), offsetY: Math.floor(Math.random() * 32) } : c)); }, clickSwatch: (id, e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); setPickerPosition({ top: rect.top - 180, left: rect.left - 40 }); setPickerOpenId(id); } }} />
              <div className={styles.divider}></div>
              <DitheringPanel styles={styles} isDark={isDark} settings={settings} updateSetting={updateSetting} paletteData={{ displayed: activePalette }} onPaletteAction={{ randomizeOffsets: () => setActivePalette(prev => prev.map(c => c.locked ? { ...c, offsetX: Math.floor(Math.random() * 32), offsetY: Math.floor(Math.random() * 32) } : c)) }} />
          </div>
      </div>

      <main className={`flex-1 relative overflow-hidden flex flex-col h-full ${isDark ? 'bg-black' : 'bg-neutral-100'}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]); }}>
        {!imageSrc && <div onClick={() => document.getElementById('main-upload')?.click()} className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 cursor-pointer"><ImageIcon className="w-10 h-10 mb-4 opacity-20" /><p>Open or drag an image or short video</p></div>}
        
        {imageSrc && (
            <div 
                ref={containerRef} 
                className="flex-1 relative overflow-hidden cursor-move" 
                style={{ touchAction: 'none' }}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsPanning(false)} onMouseLeave={() => setIsPanning(false)}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                onWheel={e => { const delta = -e.deltaY * 0.001; setViewState(v => ({...v, scale: clamp(v.scale + delta, 0.015625, 64), isFit: false})); }}
            >
                <div className="w-full h-full flex items-center justify-center pointer-events-none relative">
                    
                    {/* ORIGINAL PREVIEW */}
                    <div 
                        className={`absolute transition-opacity duration-200 ${isComparing ? 'opacity-100 z-10' : 'opacity-0 z-0'}`} 
                        style={{ transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`, width: settings.width, height: settings.height }}
                    >
                        <canvas 
                            ref={originalPixelCanvasRef} 
                            className="w-full h-full shadow-2xl" 
                            style={{ imageRendering: viewState.scale >= 1 ? 'pixelated' : 'auto', display: (viewState.scale >= 1 || !previewUrls.original) ? 'block' : 'none' }} 
                        />
                        {(viewState.scale < 1 && previewUrls.original) && (
                            <img 
                                src={previewUrls.original} 
                                className="w-full h-full shadow-2xl" 
                                style={{ imageRendering: 'auto' }} 
                                draggable="false" 
                            />
                        )}
                    </div>
                    
                    {/* DITHERED PREVIEW */}
                    <div 
                        className={`absolute transition-opacity duration-200 ${isComparing ? 'opacity-0 z-0' : 'opacity-100 z-10'}`} 
                        style={{ transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`, width: settings.width, height: settings.height }}
                    >
                        <canvas 
                            ref={canvasRef} 
                            className="w-full h-full shadow-2xl" 
                            style={{ imageRendering: viewState.scale >= 1 ? 'pixelated' : 'auto', display: (viewState.scale >= 1 || !previewUrls.dithered) ? 'block' : 'none' }} 
                        />
                        {(viewState.scale < 1 && previewUrls.dithered) && (
                            <img 
                                src={previewUrls.dithered} 
                                className="w-full h-full shadow-2xl" 
                                style={{ imageRendering: 'auto' }} 
                                draggable="false" 
                            />
                        )}
                    </div>

                </div>
            </div>
        )}
        
        {imageSrc && <FloatingToolbar styles={styles} isDark={isDark} zoom={viewState.scale} setZoom={z => setViewState(v => ({...v, scale: typeof z === 'function' ? z(v.scale) : z, isFit: false}))} isComparing={isComparing} onCompareStart={() => setIsComparing(true)} onCompareEnd={() => setIsComparing(false)} onCenter={() => setViewState(v => ({...v, x: 0, y: 0}))} onOneToOne={() => setViewState(v => ({...v, scale: 1, x: 0, y: 0, isFit: false}))} onFit={() => setViewState(v => ({...v, isFit: true}))} onDownload={() => { const link = document.createElement('a'); link.download = (isVideo || isGif) ? 'pixel-frame.png' : 'pixel-art.png'; link.href = canvasRef.current.toDataURL(); link.click(); }} isAnimation={isVideo || isGif} isGif={isGif} gifTotalFrames={gifTotalFrames} gifCurrentFrame={gifCurrentFrame} onSeekGif={handleGifSeek} onRenderGif={handleRenderGif} isVideo={isVideo} videoDuration={videoDuration} videoCurrentTime={videoCurrentTime} onSeekVideo={handleVideoSeek} onRenderVideo={handleRenderVideo} settings={settings} />}
      </main>
      
      {pickerOpenId && <ColorEditor color={activePalette.find(c => c.id === pickerOpenId)} onClose={() => setPickerOpenId(null)} position={pickerPosition} onUpdateLogic={(id, hex) => updateColor(id, hex, 'logic')} onUpdatePaint={(id, hex) => updateColor(id, hex, 'paint')} onToggleLock={(id) => { const np = [...activePalette]; const idx = np.findIndex(c => c.id === id); np[idx].locked = !np[idx].locked; setActivePalette(np); setRecalcTrigger(n => n + 1); }} isLinked={isColorsLinked} onToggleLink={() => setIsColorsLinked(!isColorsLinked)} onUpdateOffset={updateColorOffset} styles={styles} isDark={isDark} settings={settings} />}
      <PaletteLibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onApply={handleApplyPreset} styles={styles} isDark={isDark} />
      
      <canvas ref={hiddenCanvasRef} className="hidden" />
      
      {isVideo && (
          <video 
              ref={videoRef} src={imageSrc} className="hidden" playsInline muted 
              onLoadedMetadata={(e) => {
                  setVideoDuration(e.target.duration);
                  const ar = e.target.videoWidth / e.target.videoHeight;
                  lastSourceInfoRef.current = { w: e.target.videoWidth, h: e.target.videoHeight };
                  const initialWidth = Math.min(e.target.videoWidth, 360);
                  const initialHeight = Math.round(initialWidth / ar);
                  setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: initialHeight }));
                  setViewState(v => ({ ...v, isFit: true })); e.target.currentTime = 0;
              }}
              onSeeked={(e) => { if (isRenderingVideo) return; setVideoCurrentTime(e.target.currentTime); extractFrameFromSource(e.target); }}
          />
      )}
    </div>
  );
}
