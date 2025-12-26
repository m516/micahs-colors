import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Upload, Download, Palette, Image as ImageIcon, RefreshCw, Maximize, 
  MoveVertical, MoveHorizontal, Sliders, Lock, Unlock, Contrast, Anchor, 
  FolderOpen, Save, FileJson, WrapText, ZoomIn, ZoomOut, 
  Maximize2, Minimize, Focus, SunMoon, RotateCcw, X, Link as LinkIcon, Unlink, Settings, FileType
} from 'lucide-react';

// ==========================================
// 1. MATH & COLOR UTILITIES
// ==========================================

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const rgbToHex = (r, g, b) => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const hexToRgb = (hex) => {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b];
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const getDistSq = (c1, c2, metric) => {
    if (metric === 'lab') return labDistSq(c1.lab || rgbToLab(c1.r, c1.g, c1.b), c2.lab || rgbToLab(c2.r, c2.g, c2.b));
    return colorDistSq(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);
};

const colorDistSq = (r1, g1, b1, r2, g2, b2) => {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return 0.3 * (dr * dr) + 0.59 * (dg * dg) + 0.11 * (db * db);
};

const rgbToLab = (r, g, b) => {
  let R = r / 255, G = g / 255, B = b / 255;
  R = (R > 0.04045) ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = (G > 0.04045) ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = (B > 0.04045) ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;

  let X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = R * 0.0193 + G * 0.1192 + B * 0.9505;

  X /= 0.95047; Y /= 1.00000; Z /= 1.08883;
  X = (X > 0.008856) ? Math.pow(X, 1/3) : (7.787 * X) + (16/116);
  Y = (Y > 0.008856) ? Math.pow(Y, 1/3) : (7.787 * Y) + (16/116);
  Z = (Z > 0.008856) ? Math.pow(Z, 1/3) : (7.787 * Z) + (16/116);

  return [
    (116 * Y) - 16,    // L
    500 * (X - Y),     // a
    200 * (Y - Z)      // b
  ];
};

const labDistSq = (lab1, lab2) => {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return dL * dL + da * da + db * db;
};

// ==========================================
// 2. DITHERING & PALETTE ALGORITHMS
// ==========================================

const generateBayerMatrix = (n) => {
    if (n === 2) return [[0, 2], [3, 1]];
    const prev = generateBayerMatrix(n / 2);
    const size = prev.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const val = prev[y][x];
            matrix[y][x] = 4 * val;                 
            matrix[y][x + size] = 4 * val + 2;      
            matrix[y + size][x] = 4 * val + 3;      
            matrix[y + size][x + size] = 4 * val + 1; 
        }
    }
    return matrix;
};

const BAYER_MAPS = {
    2: generateBayerMatrix(2),
    4: generateBayerMatrix(4),
    8: generateBayerMatrix(8),
    16: generateBayerMatrix(16),
    32: generateBayerMatrix(32), 
};

const ERROR_KERNELS = {
    'floyd': [ { x: 1, y: 0, f: 7/16 }, { x: -1, y: 1, f: 3/16 }, { x: 0, y: 1, f: 5/16 }, { x: 1, y: 1, f: 1/16 } ],
    'false-floyd': [ { x: 1, y: 0, f: 3/8 }, { x: 0, y: 1, f: 3/8 }, { x: 1, y: 1, f: 2/8 } ],
    'atkinson': [ { x: 1, y: 0, f: 1/8 }, { x: 2, y: 0, f: 1/8 }, { x: -1, y: 1, f: 1/8 }, { x: 0, y: 1, f: 1/8 }, { x: 1, y: 1, f: 1/8 }, { x: 0, y: 2, f: 1/8 } ]
};

/**
 * Extracts a palette from pixel data using a simplified k-means/hull approach
 */
const extractPaletteHull = (pixels, k, lockedColors = [], useAnchoring = true, seed = 0) => {
  if (lockedColors.length >= k) return lockedColors.slice(0, k).map(c => ({ ...c, isNew: false }));
  
  if (pixels.length === 0) return lockedColors;

  // Step 1: Subsample pixels to get color frequency
  const colorCounts = new Map();
  const step = 4 * 2; // Skip every other pixel for speed
  for (let i = 0; i < pixels.length; i += step) {
    if (pixels[i + 3] < 128) continue; // Skip transparent
    const r = pixels[i] & 0xF8;
    const g = pixels[i+1] & 0xF8;
    const b = pixels[i+2] & 0xF8;
    const key = (r << 16) | (g << 8) | b;
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
  }

  let samples = [];
  const threshold = Math.max(1, pixels.length / (step * 5000)); 
  for (let [key, count] of colorCounts) {
    if (count >= threshold) {
      const r = (key >> 16) & 0xFF;
      const g = (key >> 8) & 0xFF;
      const b = key & 0xFF;
      samples.push({ r, g, b, lab: rgbToLab(r, g, b) });
    }
  }

  // Step 2: Select candidates using spherical distribution to find hull
  const numVectors = 1000; 
  const candidateList = [];
  const candidatesSet = new Set();
  const phi = Math.PI * (3 - Math.sqrt(5)); 

  for (let i = 0; i < numVectors; i++) {
    const y = 1 - (i / (numVectors - 1)) * 2; 
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i + (seed * 1000); 
    const dx = Math.cos(theta) * radius;
    const dy = y;
    const dz = Math.sin(theta) * radius;

    let maxDot = -Infinity;
    let bestIdx = -1;
    for (let j = 0; j < samples.length; j++) {
        const [l, a, b] = samples[j].lab;
        const dot = l * dx + a * dy + b * dz;
        if (dot > maxDot) { maxDot = dot; bestIdx = j; }
    }
    if (bestIdx !== -1 && !candidatesSet.has(bestIdx)) {
        candidatesSet.add(bestIdx);
        candidateList.push(samples[bestIdx]);
    }
  }

  let finalColors = lockedColors.map(c => ({...c})); 
  finalColors.forEach(c => { if (!c.lab) c.lab = rgbToLab(c.r, c.g, c.b); });

  // Step 3: Add Anchors (Brightest/Darkest) if requested
  if (useAnchoring && finalColors.length < k && candidateList.length > 0) {
      let minL = Infinity, maxL = -Infinity, minIdx = -1, maxIdx = -1;
      candidateList.forEach((s, idx) => {
         if (s.lab[0] < minL) { minL = s.lab[0]; minIdx = idx; }
         if (s.lab[0] > maxL) { maxL = s.lab[0]; maxIdx = idx; }
      });
      const extremes = [];
      if (minIdx !== -1) extremes.push(candidateList[minIdx]);
      if (maxIdx !== -1 && maxIdx !== minIdx) extremes.push(candidateList[maxIdx]);
      
      const validExtremes = extremes.filter(ex => !finalColors.some(p => labDistSq(p.lab, ex.lab) < 10));
      for (let ex of validExtremes) {
          if (finalColors.length < k) finalColors.push({...ex, displayR: ex.r, displayG: ex.g, displayB: ex.b, locked: false, isNew: true, id: generateId()});
      }
  }

  // Step 4: Fill remaining slots with most distinct colors
  let sourceArray = candidateList.length > (k - finalColors.length) ? candidateList : samples;
  while (finalColors.length < k) {
      let maxDist = -1, farthestIdx = -1;
      for (let i = 0; i < sourceArray.length; i++) {
          let minDist = Infinity;
          for (const p of finalColors) {
              const d = labDistSq(sourceArray[i].lab, p.lab);
              if (d < minDist) minDist = d;
          }
          if (minDist > maxDist && minDist > 10) { maxDist = minDist; farthestIdx = i; }
      }
      if (farthestIdx !== -1) {
          const s = sourceArray[farthestIdx];
          finalColors.push({ r: s.r, g: s.g, b: s.b, displayR: s.r, displayG: s.g, displayB: s.b, lab: s.lab, locked: false, isNew: true, id: generateId() });
      } else { break; }
  }
  return finalColors.map((c, i) => ({ ...c, impactIndex: i }));
};

const findNearestColor = (r, g, b, palette, metric = 'rgb') => {
  let minDist = Infinity;
  let nearest = palette[0];
  
  // Optimization: Pre-calculate target LAB if needed outside loop? 
  // For single pixel lookups, simple loop is fine.
  const targetLab = metric === 'lab' ? rgbToLab(r,g,b) : null;

  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    let d;
    if (metric === 'lab') {
        const pLab = p.lab || rgbToLab(p.r, p.g, p.b);
        d = labDistSq(targetLab, pLab);
    } else {
        d = colorDistSq(r, g, b, p.r, p.g, p.b);
    }
    
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return nearest;
};

const sortPalette = (palette, mode) => {
    const sorted = [...palette];
    if (mode === 'luminance') {
        sorted.sort((c1, c2) => {
            const l1 = rgbToLab(c1.displayR, c1.displayG, c1.displayB)[0];
            const l2 = rgbToLab(c2.displayR, c2.displayG, c2.displayB)[0];
            return l1 - l2;
        });
    } else if (mode === 'impact') {
        sorted.sort((c1, c2) => (c1.impactIndex || 0) - (c2.impactIndex || 0));
    }
    return sorted;
};

/**
 * Core rendering function that applies dithering to the canvas
 */
const renderDitheredImage = (canvas, sourceData, palette, settings) => {
    if (!canvas || !sourceData || !palette.length) return;

    const ctx = canvas.getContext('2d');
    canvas.width = sourceData.width; 
    canvas.height = sourceData.height;
    
    // Create new buffer for output
    const outputData = new ImageData(new Uint8ClampedArray(sourceData.pixels), sourceData.width, sourceData.height);
    const pixels = outputData.data;
    
    // Create Float32 buffer for error diffusion (avoids clipping errors during propagation)
    const buf = new Float32Array(sourceData.pixels);
    const { width, height } = sourceData;
    const { ditherMode, dithering, bayerSize, errorKernel, serpentine, distanceMetric } = settings;

    for (let y = 0; y < height; y++) {
        const isReverse = serpentine && (y % 2 === 1);
        const startX = isReverse ? width - 1 : 0;
        const endX = isReverse ? -1 : width;
        const stepX = isReverse ? -1 : 1;

        for (let x = startX; x !== endX; x += stepX) {
            const idx = (y * width + x) * 4;
            if (pixels[idx + 3] < 128) continue; // Skip Transparent

            if (ditherMode === 'floyd') {
                // Error Diffusion
                const oldR = buf[idx]; 
                const oldG = buf[idx+1]; 
                const oldB = buf[idx+2];
                
                const nearest = findNearestColor(oldR, oldG, oldB, palette, distanceMetric);
                
                pixels[idx] = nearest.displayR;
                pixels[idx+1] = nearest.displayG;
                pixels[idx+2] = nearest.displayB;

                const errR = (oldR - nearest.r) * dithering;
                const errG = (oldG - nearest.g) * dithering;
                const errB = (oldB - nearest.b) * dithering;

                const kernel = ERROR_KERNELS[errorKernel];
                kernel.forEach(k => {
                    const dx = isReverse ? -k.x : k.x;
                    const dy = k.y; 
                    if (x + dx >= 0 && x + dx < width && y + dy < height) {
                        const nIdx = ((y + dy) * width + (x + dx)) * 4;
                        buf[nIdx] += errR * k.f;
                        buf[nIdx+1] += errG * k.f;
                        buf[nIdx+2] += errB * k.f;
                    }
                });
            } else {
                // Ordered Dithering (Bayer)
                const r = pixels[idx]; 
                const g = pixels[idx+1]; 
                const b = pixels[idx+2];
                
                const map = BAYER_MAPS[bayerSize] || BAYER_MAPS[8];
                const mapSize = parseInt(bayerSize);
                const rawValue = map[y % mapSize][x % mapSize];
                
                // Normalize bayer value to -0.5 to 0.5 range
                const bayerVal = (rawValue / (mapSize * mapSize)) - 0.5;
                const spread = 48 * (dithering * 2); 
                const bias = bayerVal * spread;

                const nearest = findNearestColor(r + bias, g + bias, b + bias, palette, distanceMetric);
                pixels[idx] = nearest.displayR;
                pixels[idx+1] = nearest.displayG;
                pixels[idx+2] = nearest.displayB;
            }
        }
    }
    ctx.putImageData(outputData, 0, 0);
};

// ==========================================
// 3. THEME & STYLES
// ==========================================

const getThemeStyles = (isDark) => ({
    appContainer: `flex flex-col-reverse md:flex-row h-screen w-full overflow-hidden transition-colors duration-300 ${isDark ? 'bg-neutral-950 text-neutral-100' : 'bg-neutral-50 text-neutral-900'}`,
    panel: `w-full md:w-80 flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-r z-10 shadow-xl h-1/2 md:h-full min-h-0 ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-neutral-200'}`,
    panelHeader: `p-4 border-b flex items-center justify-between flex-shrink-0 ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`,
    label: `text-base uppercase tracking-wider ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`,
    textMuted: `text-sm ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`,
    heading: `text-lg ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`,
    
    // Form Elements
    input: `w-full text-base p-1 border transition-all focus:outline-none focus:ring-1 ${
        isDark 
          ? 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-neutral-500 focus:ring-neutral-500 placeholder-neutral-700' 
          : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:ring-neutral-500 placeholder-neutral-300'
    }`,
    select: `w-full text-xs p-2 border transition-all focus:outline-none focus:ring-1 appearance-none ${
        isDark
          ? 'bg-neutral-950 border-neutral-700 text-neutral-100 focus:border-neutral-500 focus:ring-neutral-500'
          : 'bg-white border-neutral-300 text-neutral-900 focus:border-neutral-500 focus:ring-neutral-500'
    }`,
    range: `w-full h-2 appearance-none cursor-pointer ${
        isDark ? 'bg-neutral-800 accent-white' : 'bg-neutral-200 accent-neutral-900'
    }`,
    
    // Buttons
    button: `p-2 transition-colors flex items-center justify-center gap-1 font-medium border border-transparent ${
        isDark 
          ? 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100' 
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
    }`,
    buttonActive: `p-2 transition-colors flex items-center justify-center gap-2 font-medium shadow-sm border ${
        isDark
          ? 'bg-neutral-400 text-neutral-800 border-neutral-800 hover:bg-neutral-700'
          : 'bg-neutral-900 text-white border-neutral-900 hover:bg-black'
    }`,
    buttonGhost: `p-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`,
    
    // Component specific
    segmentGroup: `flex p-1 gap-1 border ${isDark ? 'bg-neutral-950 border-neutral-800' : 'bg-neutral-100 border-neutral-200'}`,
    segmentButton: (isActive) => `flex-1 py-1 text-base font-medium transition-all ${
        isActive 
          ? (isDark ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm') 
          : (isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-500 hover:text-neutral-900')
    }`,
    toolbar: `absolute bottom-6 left-1/2 transform -translate-x-1/2 backdrop-blur-md shadow-xl border px-4 py-1 flex items-center gap-2 z-40 transition-all ${
        isDark 
          ? 'bg-neutral-900/90 border-neutral-800 text-neutral-200' 
          : 'bg-white/90 border-neutral-200 text-neutral-700'
    }`,
    popover: `fixed z-50 shadow-2xl p-4 w-48 border ${
        isDark ? 'bg-neutral-900 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
    }`,
    divider: `w-full h-px my-4 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`
});

// ==========================================
// 4. SUB-COMPONENTS
// ==========================================

const ControlPanel = ({ 
    isDark, styles, settings, setSettings, 
    imageLoaded, onFileSelect, 
    paletteData, onPaletteAction,
    onResetOriginalSize 
}) => {
    const fileInputRef = useRef(null);
    const paletteInputRef = useRef(null);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    return (
        <aside className={styles.panel}>
            {/* Header */}
            <div className={styles.panelHeader}>
                <div className="flex items-center gap-2">
                    <Sliders className={`w-5 h-5 ${isDark ? 'text-neutral-100' : 'text-neutral-900'}`} />
                    <h1 className={styles.heading}>Micah's Colors</h1>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className={styles.button} title="Open Image">
                    <FolderOpen className="w-4 h-4" />
                    <span className="hidden sm:inline">Open</span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => onFileSelect(e.target.files?.[0])} />
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y- min-h-0">
                {/* 1. Dimensions Section */}
                <div className="space-y-3">
                    <div className="flex justify-between mb-4">
                        <h3 className={styles.label}>Resolution</h3>
                        {imageLoaded && (
                            <button onClick={onResetOriginalSize} className={styles.buttonGhost + " transition-colors flex items-center gap-1"} title="Set to Original Image Size">
                                <RotateCcw size={10} /> <span>Original</span>
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <div className={`flex justify-between mb-1 ${styles.textMuted}`}><span>Width</span></div>
                            <input 
                                type="number" 
                                value={settings.width} 
                                onChange={(e) => {
                                    var w = clamp(Number(e.target.value), 32, 5000); 
                                    updateSetting('width', w); 
                                    updateSetting('height', Math.round(w / settings.aspectRatio));
                                  }
                                }
                                className={styles.input} 
                            />
                        </div>
                        <div className="flex-1">
                            <div className={`flex justify-between mb-1 ${styles.textMuted}`}><span>Height</span></div>
                            <input 
                                type="number" 
                                value={settings.height} 
                                onChange={(e) => {
                                    var h = clamp(Number(e.target.value), 32, 5000); 
                                    updateSetting('height', h);
                                    updateSetting('width', Math.round(h * settings.aspectRatio));
                                  }   
                                }
                                className={styles.input} 
                            />
                        </div>
                    </div>
                    <input 
                        type="range" min="32" max="640" step="4" 
                        value={Math.min(settings.width, 640)} 
                        onChange={(e) => {
                          var w = clamp(Number(e.target.value), 32, 5000); 
                          updateSetting('width', w); 
                          updateSetting('height', Math.round(w / settings.aspectRatio));
                        }} 
                        className={styles.range} 
                    />
                </div>

                <div className={styles.divider}></div>

                {/* 2. Dithering Section */}
                <div className="space-y-3">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className={styles.label}>Dithering</h3>
                        <div className="w-24">
                            <select value={settings.distanceMetric} onChange={(e) => updateSetting('distanceMetric', e.target.value)} className={styles.select + " text-xs py-1 px-1"}>
                                <option value="rgb">RGB Dist</option>
                                <option value="lab">LAB Dist</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.segmentGroup}>
                        <button onClick={() => updateSetting('ditherMode', 'floyd')} className={styles.segmentButton(settings.ditherMode === 'floyd')}>Error Diff.</button>
                        <button onClick={() => updateSetting('ditherMode', 'ordered')} className={styles.segmentButton(settings.ditherMode === 'ordered')}>Bayer</button>
                    </div>

                    {settings.ditherMode === 'floyd' ? (
                        <div className="grid grid-cols-2 gap-2">
                            <select value={settings.errorKernel} onChange={(e) => updateSetting('errorKernel', e.target.value)} className={styles.select + " text-xs"}>
                                <option value="floyd">Floyd-Steinberg</option>
                                <option value="atkinson">Atkinson</option>
                                <option value="false-floyd">False Floyd</option>
                            </select>
                            <button onClick={() => updateSetting('serpentine', !settings.serpentine)} className={`flex items-center justify-center border text-sm font-medium transition-colors ${settings.serpentine ? styles.buttonActive : styles.button}`} style={{ padding: '0.25rem 0.5rem' }}>
                                <WrapText size={12} /> Serpentine
                            </button>
                        </div>
                    ) : (
                        <div className={styles.segmentGroup}>
                            {[2, 4, 8, 16, 32].map(s => (
                                <button key={s} onClick={() => updateSetting('bayerSize', s)} className={styles.segmentButton(settings.bayerSize === s)}>{s}x</button>
                            ))}
                        </div>
                    )}
                    <div className="space-y-1">
                        <div className={`flex justify-between ${styles.textMuted}`}><span>Intensity</span><span className="text-base">{Math.round(settings.dithering * 100)}%</span></div>
                        <input type="range" min="0" max="1" step="0.05" value={settings.dithering} onChange={(e) => updateSetting('dithering', Number(e.target.value))} className={styles.range} />
                    </div>
                </div>

                <div className={styles.divider}></div>

                {/* 3. Palette Section */}
                <div className="space-y-3 pb-10">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                            <h3 className={styles.label}>Palette</h3>
                            <button onClick={() => updateSetting('genSeed', s => s + 1)} className={styles.buttonGhost} title="Regenerate"><RotateCcw size={12} /></button>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => updateSetting('contrastAnchoring', !settings.contrastAnchoring)} className={settings.contrastAnchoring ? styles.buttonActive : styles.buttonGhost} title="Contrast anchoring-add the brightest and darkest pixels into the palette"><Anchor size={18} /></button>
                            <button onClick={() => paletteInputRef.current?.click()} className={styles.buttonGhost} title="Import"><FolderOpen size={18} /></button>
                            <input type="file" ref={paletteInputRef} className="hidden" accept=".json,.txt,.hex,.gpl" onChange={onPaletteAction.import} />
                            <div className="relative">
                                <button onClick={() => setShowExportMenu(!showExportMenu)} className={styles.buttonGhost} title="Export"><Save size={18} /></button>
                                {showExportMenu && (
                                    <div className={`absolute text-sm right-0 top-full mt-2 w-24 shadow-xl z-50 overflow-hidden flex flex-col border ${isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'}`}>
                                        <button onClick={() => { onPaletteAction.export('hex'); setShowExportMenu(false); }} className={`px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>HEX</button>
                                        <button onClick={() => { onPaletteAction.export('json'); setShowExportMenu(false); }} className={`px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>JSON</button>
                                        <button onClick={() => { onPaletteAction.export('gpl'); setShowExportMenu(false); }} className={`px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>GPL</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className={`flex justify-between items-center ${styles.textMuted}`}>
                            <span>Colors</span>
                            <input type="number" min="2" max="256" value={settings.paletteSize} onChange={(e) => updateSetting('paletteSize', clamp(Number(e.target.value), 2, 256))} className={styles.input} style={{width: '60px'}} />
                        </div>
                        <input type="range" min="2" max="32" step="1" value={Math.min(settings.paletteSize, 32)} onChange={(e) => updateSetting('paletteSize', Number(e.target.value))} className={styles.range} />
                    </div>

                    <div className="grid grid-cols-4">
                        {paletteData.displayed.map((color, i) => {
                            const lHex = rgbToHex(color.r, color.g, color.b);
                            const pHex = rgbToHex(color.displayR, color.displayG, color.displayB);
                            const isSwapped = (lHex !== pHex);
                            return (
                                <div
                                    key={color.id || i}
                                    className={`w-full aspect-square shadow-sm border relative group cursor-pointer overflow-hidden transition-transform hover:scale-105 ${color.locked ? 'border-white ring-1 ring-black/20' : 'border-transparent'} ${paletteData.pickerId === color.id ? 'ring-2 ring-neutral-500 z-10' : ''}`}
                                    onClick={(e) => onPaletteAction.clickSwatch(color.id, e)}
                                >
                                    {isSwapped ? (
                                        <div className="absolute inset-0 flex">
                                            <div className="flex-1" style={{ backgroundColor: lHex }}></div>
                                            <div className="flex-1" style={{ backgroundColor: pHex }}></div>
                                        </div>
                                    ) : (
                                        <div className="absolute inset-0" style={{ backgroundColor: pHex }}></div>
                                    )}
                                    {color.locked && <div className="absolute top-0.5 right-0.5 text-white/90 drop-shadow-md"><Lock size={10} /></div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </aside>
    );
};

const ColorEditor = ({ 
    color, onClose, position, 
    onUpdateLogic, onUpdatePaint, onToggleLock, 
    isLinked, onToggleLink, styles, isDark 
}) => {
    if (!color) return null;
    
    const logicHex = rgbToHex(color.r, color.g, color.b);
    const paintHex = rgbToHex(color.displayR, color.displayG, color.displayB);

    return (
        <div 
            className={styles.popover}
            style={{ top: position.top, left: position.left }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-3">
                <h3 className={styles.label}>Edit Color</h3>
                <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600"><X size={14} /></button>
            </div>
            
            <div className="flex items-center justify-between gap-2">
                {/* Logic Color */}
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs tracking-wider text-neutral-400">Logic</span>
                    <div className="relative w-10 h-10 border overflow-hidden shadow-sm hover:border-neutral-500 transition-colors">
                        <div className="absolute inset-0" style={{background: logicHex}}></div>
                        <input type="color" value={logicHex} onChange={(e) => onUpdateLogic(color.id, e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </div>
                    <div className="text-xs text-neutral-500">{logicHex}</div>
                </div>
                
                {/* Link Toggle */}
                <div className="flex flex-col items-center pt-4">
                     <button onClick={onToggleLink} className={`transition-all ${isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-black'}`}>
                         {isLinked ? <LinkIcon size={16} /> : <Unlink size={16} />}
                     </button>
                </div>

                {/* Paint Color */}
                <div className="flex flex-col items-center gap-1">
                    <span className="text-xs tracking-wider text-neutral-400">Paint</span>
                    <div className="relative w-10 h-10 border overflow-hidden shadow-sm hover:border-neutral-500 transition-colors">
                        <div className="absolute inset-0" style={{background: paintHex}}></div>
                        <input type="color" value={paintHex} onChange={(e) => onUpdatePaint(color.id, e.target.value)} className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </div>
                     <div className="text-xs text-neutral-500">{paintHex}</div>
                </div>
            </div>
            
            <div className={styles.divider}></div>
            
            <button onClick={(e) => onToggleLock(color.id, e)} className={color.locked ? styles.buttonActive + " w-full rounded" : styles.button + " w-full bg-neutral-200 dark:bg-neutral-800 rounded"}>
                {color.locked ? <><Lock size={12} /> LOCKED</> : <><Unlock size={12} /> UNLOCKED</>}
            </button>
        </div>
    );
};

const FloatingToolbar = ({ 
    styles, isDark, 
    zoom, setZoom, 
    onCenter, onOneToOne, onFit, onDownload 
}) => {
    const [tempInput, setTempInput] = useState('100');
    
    useEffect(() => { setTempInput(Math.round(zoom * 100).toString()); }, [zoom]);

    const handleBlur = () => {
        const val = parseFloat(tempInput);
        if (!isNaN(val) && val > 0) setZoom(val / 100);
        else setTempInput(Math.round(zoom * 100).toString());
    };

    const getNextSnap = (current, direction) => {
        const isZoomIn = direction > 0;
        const epsilon = 0.001;
        let newScale;
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

    return (
        <div className={styles.toolbar}>
             <button onClick={() => setZoom(getNextSnap(zoom, -1))} className={styles.buttonGhost}><ZoomOut className="w-5 h-5" /></button>
             <div className="relative flex items-center justify-center">
               <input 
                  type="text" 
                  value={tempInput}
                  onChange={(e) => setTempInput(e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                  className="w-10 bg-transparent text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-neutral-500 px-0.5 rounded"
               />
               <span className="text-xs opacity-50">%</span>
             </div>
             <button onClick={() => setZoom(getNextSnap(zoom, 1))} className={styles.buttonGhost}><ZoomIn className="w-5 h-5" /></button>
             <div className={`w-px h-5 mx-1 ${isDark ? 'bg-neutral-600' : 'bg-neutral-300'}`}></div>
             <button onClick={onCenter} className={styles.buttonGhost} title="Center"><Focus className="w-5 h-5" /></button>
             <button onClick={onOneToOne} className={styles.buttonGhost} title="1:1"><Maximize className="w-5 h-5" /></button>
             <button onClick={onFit} className={styles.buttonGhost} title="Fit"><Minimize className="w-5 h-5" /></button>
             <div className={`w-px h-5 mx-1 ${isDark ? 'bg-neutral-600' : 'bg-neutral-300'}`}></div>
             <button onClick={onDownload} className={styles.buttonGhost} title="Download"><Download className="w-5 h-5" /></button>
        </div>
    );
};

// ==========================================
// 5. MAIN APPLICATION
// ==========================================

export default function App() {
  // --- Dark Mode & Theme ---
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mediaQuery.matches);
    const handler = (e) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  const styles = useMemo(() => getThemeStyles(isDark), [isDark]);

  // --- Core State ---
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
      width: 128,
      height: 128,
      aspectRatio: 1,
      paletteSize: 8,
      dithering: 0.15,
      ditherMode: 'ordered',
      sortMode: 'impact',
      bayerSize: 2,
      errorKernel: 'floyd',
      serpentine: false,
      distanceMetric: 'rgb',
      contrastAnchoring: false,
      genSeed: 0
  });

  // --- Pipeline State ---
  const [activePalette, setActivePalette] = useState([]);
  const [displayedPalette, setDisplayedPalette] = useState([]); 
  const [sourceVersion, setSourceVersion] = useState(0); 
  const [recalcTrigger, setRecalcTrigger] = useState(0); 

  // --- UI State ---
  const [pickerOpenId, setPickerOpenId] = useState(null);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 }); 
  const [isColorsLinked, setIsColorsLinked] = useState(true); 
  
  // --- Viewer State ---
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0, isFit: true });
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  
  // --- Refs ---
  const sourceDataRef = useRef(null); 
  const canvasRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const activePaletteRef = useRef([]); 
  const lastSourceInfoRef = useRef({ w: 0, h: 0 });
  const containerRef = useRef(null);
  const dragCounter = useRef(0);
  const exitTimeoutRef = useRef(null);
  
  // Helper: Sync Ref
  useEffect(() => { activePaletteRef.current = activePalette; }, [activePalette]);

  // --- Actions ---
  const processImageFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const ar = img.width / img.height;
        const last = lastSourceInfoRef.current;
        // Auto-resize if significantly different
        let newW = settings.width, newH = settings.height;
        if (Math.abs(img.width - last.w) > 10 || Math.abs(img.height - last.h) > 10) {
            newW = 128; newH = Math.round(128 / ar);
        }
        
        lastSourceInfoRef.current = { w: img.width, h: img.height };
        setSettings(s => ({ ...s, aspectRatio: ar, width: newW, height: newH }));
        setImageSrc(img.src);
        setLoading(false);
        setViewState(v => ({ ...v, isFit: true }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }, [settings.width, settings.height]);

  const setOriginalSize = () => {
      if (lastSourceInfoRef.current.w > 0) {
          setSettings(s => ({ ...s, width: lastSourceInfoRef.current.w, height: lastSourceInfoRef.current.h }));
      }
  };

  // --- Pipeline Effects ---

  // 1. Load Image Source Data
  useEffect(() => {
    if (!imageSrc || !hiddenCanvasRef.current) return;
    setLoading(true);
    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
        const canvas = hiddenCanvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = settings.width; 
        canvas.height = settings.height;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, settings.width, settings.height);
        const imgData = ctx.getImageData(0, 0, settings.width, settings.height);
        sourceDataRef.current = { width: settings.width, height: settings.height, pixels: imgData.data };
        setSourceVersion(v => v + 1);
        setLoading(false);
    };
  }, [imageSrc, settings.width, settings.height]);

  // 2. Extract Palette
  useEffect(() => {
    if (!sourceDataRef.current) return;
    const delay = settings.sortMode === 'impact' ? 20 : 50;
    const timer = setTimeout(() => {
        const pixels = sourceDataRef.current.pixels;
        const currentPalette = activePaletteRef.current;
        const lockedColors = currentPalette.filter(c => c.locked);
        
        let newPalette = extractPaletteHull(pixels, settings.paletteSize, lockedColors, settings.contrastAnchoring, settings.genSeed);
        newPalette = sortPalette(newPalette, settings.sortMode);

        setActivePalette(newPalette);
    }, delay);
    return () => clearTimeout(timer);
  }, [sourceVersion, settings.paletteSize, settings.contrastAnchoring, settings.sortMode, settings.genSeed, recalcTrigger]); 

  // 3. Update Displayed Palette (Debounced UI)
  useEffect(() => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
      if (settings.sortMode !== 'impact') {
          setDisplayedPalette(activePalette);
          return;
      }
      if (activePalette.length >= displayedPalette.length) {
          setDisplayedPalette(activePalette);
      } else {
          exitTimeoutRef.current = setTimeout(() => {
              setDisplayedPalette(activePalette);
          }, 300);
      }
  }, [activePalette, settings.sortMode]);

  // 4. Render Dithering to Canvas
  useEffect(() => {
    if (!sourceDataRef.current || !canvasRef.current || activePalette.length === 0) return;
    setLoading(true);
    const timer = setTimeout(() => {
        renderDitheredImage(canvasRef.current, sourceDataRef.current, activePalette, settings);
        setLoading(false);
    }, 10);
    return () => clearTimeout(timer);
  }, [activePalette, sourceVersion, settings.dithering, settings.ditherMode, settings.bayerSize, settings.errorKernel, settings.serpentine, settings.distanceMetric]);

  // --- Viewer Logic ---

  const handleZoom = (newScale) => {
    const safeScale = Math.min(Math.max(newScale, 0.015625), 64);
    setViewState(v => ({ ...v, scale: safeScale, isFit: false }));
  };

  const handleDrag = (dx, dy) => {
      setViewState(v => ({ ...v, x: v.x + dx, y: v.y + dy, isFit: false }));
  };

  const resetView = useCallback(() => {
      if (containerRef.current) {
          const cw = containerRef.current.clientWidth;
          const ch = containerRef.current.clientHeight;
          const scaleX = (cw * 0.9) / settings.width;
          const scaleY = (ch * 0.9) / settings.height;
          setViewState(v => ({ ...v, scale: Math.min(scaleX, scaleY, 4), x: 0, y: 0 }));
      }
  }, [settings.width, settings.height]);

  useEffect(() => { if (viewState.isFit) resetView(); }, [settings.width, settings.height, viewState.isFit, resetView]);

  // --- Palette & Color Actions ---

  const handlePaletteImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const hexMatches = text.match(/#[0-9A-Fa-f]{6}/g);
      if (hexMatches && hexMatches.length > 0) {
          const newPalette = hexMatches.map((hex, i) => {
              const [r, g, b] = hexToRgb(hex);
              return { 
                  r, g, b, 
                  displayR: r, displayG: g, displayB: b, 
                  lab: rgbToLab(r,g,b), 
                  locked: true, isNew: true, 
                  id: generateId(), impactIndex: i 
              };
          });
          const capped = newPalette.slice(0, 256); 
          setActivePalette(capped);
          setSettings(s => ({ ...s, paletteSize: capped.length }));
      } else { alert("No valid hex codes found."); }
    };
    reader.readAsText(file);
    e.target.value = null;
  };

  const handlePaletteExport = (format) => {
      if (activePalette.length === 0) return;
      let content = "", mimeType = "text/plain", extension = "txt";
      if (format === 'hex') {
          content = activePalette.map(c => rgbToHex(c.displayR, c.displayG, c.displayB)).join('\n');
          extension = "hex";
      } else if (format === 'json') {
          content = JSON.stringify(activePalette.map(c => rgbToHex(c.displayR, c.displayG, c.displayB)), null, 2);
          mimeType = "application/json";
          extension = "json";
      } else if (format === 'gpl') {
          content = "GIMP Palette\nName: Micah's Colors Palette\nColumns: 4\n#\n";
          activePalette.forEach(c => {
              const hex = rgbToHex(c.displayR, c.displayG, c.displayB);
              content += `${c.displayR} ${c.displayG} ${c.displayB} ${hex}\n`;
          });
          extension = "gpl";
      }
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `palette.${extension}`;
      link.href = url;
      link.click();
  };

  const handleSwatchClick = (id, e) => {
      e.stopPropagation();
      if (pickerOpenId === id) { setPickerOpenId(null); } 
      else {
          const rect = e.currentTarget.getBoundingClientRect();
          const popoverWidth = 200; // estimated
          const popoverHeight = 240; 
          let top = rect.top - popoverHeight - 10;
          let left = rect.left + (rect.width / 2) - (popoverWidth / 2);
          // Boundary checks
          if (left < 10) left = 10;
          if (left + popoverWidth > window.innerWidth) left = window.innerWidth - popoverWidth - 10;
          if (top < 10) top = rect.bottom + 10; 
          setPickerPosition({ top, left });
          setPickerOpenId(id);
      }
  };

  const updateColor = (id, hex, mode) => {
      const [r, g, b] = hexToRgb(hex);
      const newPalette = [...activePaletteRef.current];
      const index = newPalette.findIndex(c => c.id === id);
      if (index === -1) return;
      
      const c = newPalette[index];
      if (mode === 'logic') {
          c.r = r; c.g = g; c.b = b;
          delete c.lab; // Recalc needed
          if (isColorsLinked) { c.displayR = r; c.displayG = g; c.displayB = b; }
      } else {
          c.displayR = r; c.displayG = g; c.displayB = b;
          if (isColorsLinked) { 
              c.r = r; c.g = g; c.b = b; 
              delete c.lab; 
          }
      }
      c.locked = true;
      newPalette[index] = c;
      setActivePalette(sortPalette(newPalette, settings.sortMode));
      if (mode === 'logic' || isColorsLinked) setRecalcTrigger(n => n + 1);
  };

  const toggleLock = (id, e) => {
      e.stopPropagation(); 
      const newPalette = [...activePaletteRef.current];
      const index = newPalette.findIndex(c => c.id === id);
      if (index === -1) return;
      newPalette[index] = { ...newPalette[index], locked: !newPalette[index].locked };
      setActivePalette(newPalette);
      setRecalcTrigger(n => n + 1);
  };

  // --- Interaction Handlers (Mouse/Touch) ---
  const [dragStart, setDragStart] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const handleMouseDown = (e) => {
    if (!imageSrc) return;
    setIsPanning(true);
    setDragStart({ x: e.clientX - viewState.x, y: e.clientY - viewState.y });
    setViewState(v => ({ ...v, isFit: false }));
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setViewState(v => ({ ...v, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  };
  
  const handleMouseUp = () => setIsPanning(false);

  // --- Render ---
  
  return (
    <div className={styles.appContainer} onClick={() => setPickerOpenId(null)}>
      
      <ControlPanel 
          isDark={isDark} 
          styles={styles} 
          settings={settings} 
          setSettings={setSettings}
          imageLoaded={!!imageSrc}
          onFileSelect={processImageFile}
          onResetOriginalSize={setOriginalSize}
          paletteData={{ displayed: displayedPalette, pickerId: pickerOpenId }}
          onPaletteAction={{
              import: handlePaletteImport,
              export: handlePaletteExport,
              clickSwatch: handleSwatchClick
          }}
      />

      {/* Main Canvas Area */}
      <main 
        className={`flex-1 relative overflow-hidden flex flex-col h-1/2 md:h-full ${isDark ? 'bg-black' : 'bg-neutral-100'}`}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDraggingFile(true); }}
        onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setIsDraggingFile(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
            e.preventDefault(); setIsDraggingFile(false); dragCounter.current = 0;
            if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]);
        }}
      >
        {isDraggingFile && (
          <div className={`absolute inset-0 z-50 backdrop-blur-sm border-4 border-dashed m-4 flex items-center justify-center pointer-events-none ${isDark ? 'bg-neutral-800/80 border-neutral-500' : 'bg-white/80 border-neutral-400'}`}>
             <div className={`p-6 shadow-xl text-center ${isDark ? 'bg-neutral-800 text-white' : 'bg-white text-neutral-800'}`}>
                <Upload className="w-12 h-12 mx-auto mb-2" />
                <h3 className="text-xl font-bold">Drop image here</h3>
             </div>
          </div>
        )}

        {!imageSrc && (
          <div onClick={() => document.querySelector('input[type=file]')?.click()} className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 p-8 text-center cursor-pointer hover:bg-black/5 transition-colors">
            <div className={`w-24 h-24 flex items-center justify-center mb-4 ${isDark ? 'bg-neutral-800' : 'bg-neutral-200'}`}>
              <ImageIcon className="w-10 h-10" />
            </div>
            <h2 className={`text-2xl ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>No Image Loaded</h2>
            <p className="mt-2 max-w-sm">Tap "Open" to load an image, or drag and drop a file.</p>
          </div>
        )}

        {/* Viewport */}
        <div 
          ref={containerRef}
          className={`flex-1 overflow-hidden relative cursor-move touch-none ${!imageSrc ? 'hidden' : ''}`}
          style={{ touchAction: 'none' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={(e) => {
             if (imageSrc && !e.ctrlKey) {
                 const delta = -e.deltaY * 0.001;
                 handleZoom(viewState.scale + delta);
             }
          }}
        >
           <canvas ref={hiddenCanvasRef} className="hidden" />
           {imageSrc && (
             <div className="w-full h-full flex items-center justify-center origin-center will-change-transform">
                <canvas 
                    ref={canvasRef} 
                    className="shadow-2xl max-w-none select-none pointer-events-none block"
                    style={{ 
                        transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.scale})`,
                        imageRendering: viewState.scale >= 1 ? 'pixelated' : 'auto',
                        width: settings.width, 
                        height: settings.height 
                    }} 
                />
             </div>
           )}
        </div>

        {/* Loading Overlay */}
        {loading && (
            <div className="absolute top-6 right-6 bg-black/70 text-white p-2 shadow-lg backdrop-blur-md animate-pulse rounded">
                <RefreshCw className="animate-spin w-5 h-5" />
            </div>
        )}

        {/* Floating Toolbar */}
        {imageSrc && (
            <FloatingToolbar 
                styles={styles} 
                isDark={isDark}
                zoom={viewState.scale}
                setZoom={handleZoom}
                onCenter={() => setViewState(v => ({ ...v, x: 0, y: 0 }))}
                onOneToOne={() => { setViewState(v => ({ ...v, scale: 1, x: 0, y: 0, isFit: false })); }}
                onFit={() => setViewState(v => ({ ...v, isFit: true }))}
                onDownload={() => {
                    if (canvasRef.current) {
                        const link = document.createElement('a');
                        link.download = 'pixel-art.png';
                        link.href = canvasRef.current.toDataURL('image/png');
                        link.click();
                    }
                }}
            />
        )}
      </main>

      {/* Color Picker Popover */}
      {pickerOpenId !== null && (
          <ColorEditor 
             color={activePalette.find(c => c.id === pickerOpenId)}
             onClose={() => setPickerOpenId(null)}
             position={pickerPosition}
             onUpdateLogic={(id, hex) => updateColor(id, hex, 'logic')}
             onUpdatePaint={(id, hex) => updateColor(id, hex, 'paint')}
             onToggleLock={toggleLock}
             isLinked={isColorsLinked}
             onToggleLink={() => setIsColorsLinked(!isColorsLinked)}
             styles={styles}
             isDark={isDark}
          />
      )}
    </div>
  );
}