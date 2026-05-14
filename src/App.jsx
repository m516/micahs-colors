import { useState, useEffect, useRef, useCallback } from 'react';
import { GifReader, GifWriter } from 'omggif';
import { Download, Image as ImageIcon, RefreshCw, FolderOpen, Layers, Film, ImagePlay } from 'lucide-react';
import { clamp, generateId } from './lib/math';
import { rgbToHex, hexToRgb, ColorSpaceConverter } from './lib/color';
import { nearestZoomSnap, floorZoomSnap } from './lib/zoom';
import { renderDitheredImage, sortPalette, buildGifPalette } from './lib/dithering';
import { applyColorTransfer } from './lib/grade';
import { runExtractor } from './lib/palette-extractors';
import { cls, IconButton } from './components/ui';
import { PaletteLibraryModal } from './components/panels/PaletteLibraryModal';
import { ImageSetupPanel } from './components/panels/ImageSetupPanel';
import { ColorsPanel } from './components/panels/ColorsPanel';
import { PalettePanel } from './components/panels/PalettePanel';
import { DitheringPanel } from './components/panels/DitheringPanel';
import { ColorEditor } from './components/panels/ColorEditor';
import { FloatingToolbar } from './components/panels/FloatingToolbar';
import { ReferencesModal } from './components/panels/ReferencesModal';

export default function App() {
  // Light/dark theme is driven entirely by Tailwind's dark: prefix, which
  // follows the OS's prefers-color-scheme. No JS theme state is needed —
  // adding/removing a `.dark` class on the html element is the only escape
  // hatch if a manual toggle is ever introduced.

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
      colorSpace: 'oklab', matchMethod: 'fw', manualWeights: { r: 0.21, g: 0.72, b: 0.07 },
      paletteSize: 4, genSeed: 0, sortMode: 'impact',
      paletteExtractor: 'hull',
      contrastEnhancement: 'none', // 'none' | 'extremes' | 'single-corners' | 'every-corners'
      ditherCategory: 'pattern', ditherSubMethod: 'bayer', dithering: 0.15, bayerSize: 2,
      serpentine: false, nCandidates: 4, distanceExponent: 2.0, riemersmaHistory: 16, riemersmaRatio: 16, ditherSeed: 0,
      videoFps: 30, originalFps: null,
      colorTransfer: 'none', // 'none' | 'box' | 'reinhard' | 'xiao-ma'
  });

  const updateSetting = useCallback((key, value) => { setSettings(prev => ({ ...prev, [key]: value })); }, []);

  const [activePalette, setActivePalette] = useState([]); 
  const [sourceVersion, setSourceVersion] = useState(0); 
  const [recalcTrigger, setRecalcTrigger] = useState(0); 
  const [isComparing, setIsComparing] = useState(false);
  const [pickerOpenId, setPickerOpenId] = useState(null); 
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 }); 
  const [isColorsLinked, setIsColorsLinked] = useState(true); 
  // viewState = the TARGET (where we want the canvas to be). All user actions update it.
  // displayViewState = the ACTUAL (what's currently rendered). A RAF loop lerps it toward
  // the target — log-space for scale, linear for pan — giving a "weighted" feel that
  // matches the user's reference image-viewer prototype. Drag operations sync display
  // immediately so drag stays 1:1 with the cursor; everything else animates.
  const [viewState, setViewState] = useState({ scale: 1, x: 0, y: 0, isFit: true });
  const [displayViewState, setDisplayViewState] = useState({ scale: 1, x: 0, y: 0 });
  const viewStateRef = useRef(viewState);
  const displayViewStateRef = useRef(displayViewState);
  useEffect(() => { viewStateRef.current = viewState; }, [viewState]);
  useEffect(() => { displayViewStateRef.current = displayViewState; }, [displayViewState]);

  // Set target AND sync display immediately. Use during drag, where the cursor expects
  // 1:1 image movement with no lerp lag.
  const setViewStateImmediate = useCallback((updater) => {
      setViewState(prev => {
          const next = typeof updater === 'function' ? updater(prev) : updater;
          setDisplayViewState({ scale: next.scale, x: next.x, y: next.y });
          return next;
      });
  }, []);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isReferencesOpen, setIsReferencesOpen] = useState(false);

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
      // willReadFrequently opts into a CPU-backed pixel buffer. This canvas is the
      // scrubbing hot path: drawImage(video) + getImageData(full frame) fires for every
      // frame during video timeline scrubbing. Without the flag, Chrome warns and
      // each readback round-trips through the GPU.
      const ctx = hiddenCanvasRef.current.getContext('2d', { willReadFrequently: true });
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
      const uint8Array = new Uint8Array(buffer);
      const reader = new GifReader(uint8Array);
      const w = reader.width; const h = reader.height;
      const frameCount = reader.numFrames();

      lastSourceInfoRef.current = { w, h };
      const ar = w / h;
      const initialWidth = Math.min(w, 360);

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
      
      let totalDelay = 0;
      frames.forEach(f => { totalDelay += Math.max(2, f.delay) * 10; });
      const avgDelayMs = totalDelay / frameCount;
      const avgFps = Math.max(1, Math.round(1000 / avgDelayMs));
      
      gifFramesRef.current = frames;
      setIsGif(true);
      setIsVideo(false);
      setGifTotalFrames(frameCount);
      setGifCurrentFrame(0);
      setViewState(v => ({ ...v, isFit: true }));
      setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: Math.round(initialWidth / ar), videoFps: avgFps, originalFps: avgFps }));

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

    // Extract-from-Image on a GIF: prefer the GIF's embedded palette (Global
    // Color Table or frame 0's Local Color Table, whichever omggif resolves)
    // over a hull extraction on the rasterized first frame. Drop the
    // transparent index — it carries no useful color. Falls through to the
    // hull path if the GIF has no usable palette table.
    if (type === 'palette' && isGifFile) {
        const fr = new FileReader();
        fr.onload = (e) => {
            try {
                const uint8 = new Uint8Array(e.target.result);
                const gif = new GifReader(uint8);
                const info = gif.numFrames() > 0 ? gif.frameInfo(0) : null;
                if (!info || !info.palette_offset || info.palette_size === 0) {
                    throw new Error('GIF has no embedded palette');
                }
                const liveSettings = settingsRef.current;
                const Converter = ColorSpaceConverter[liveSettings.colorSpace];
                const palette = [];
                for (let i = 0; i < info.palette_size; i++) {
                    if (i === info.transparent_index) continue;
                    const r = uint8[info.palette_offset + i * 3];
                    const g = uint8[info.palette_offset + i * 3 + 1];
                    const b = uint8[info.palette_offset + i * 3 + 2];
                    palette.push({
                        r, g, b,
                        displayR: r, displayG: g, displayB: b,
                        transformed: Converter.to(r, g, b),
                        offsetX: 0, offsetY: 0,
                        // locked=true so the next auto-extract (any sourceVersion /
                        // settings bump) preserves these colors instead of replacing
                        // them with a fresh hull extraction from the source frame.
                        locked: true, isNew: true,
                        id: generateId(),
                        impactIndex: palette.length,
                    });
                }
                if (palette.length > 0) {
                    // Embedded palettes are sized by the GIF, not by settings.paletteSize.
                    // Bumping the setting keeps the swatch grid / segment buttons honest.
                    setSettings(s => ({ ...s, paletteSize: Math.min(256, Math.max(2, palette.length)) }));
                    setActivePalette(sortPalette(palette, liveSettings.sortMode));
                }
            } catch (err) {
                console.warn('processImageFile: GIF palette extraction failed', err);
            }
            setLoading(false);
        };
        fr.onerror = () => {
            console.warn('processImageFile: failed to read GIF buffer', file?.name);
            setLoading(false);
        };
        fr.readAsArrayBuffer(file);
        return;
    }

    const img = new Image();
    img.onload = () => {
      if (type === 'main') {
          const ar = img.width / img.height;
          lastSourceInfoRef.current = { w: img.width, h: img.height };
          const initialWidth = Math.min(img.width, 360);
          const initialHeight = Math.round(initialWidth / ar);
          setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: initialHeight, originalFps: null }));
          setImageSrc(img.src);
          setViewState(v => ({ ...v, isFit: true }));
          setTimeout(() => extractFrameFromSource(img), 0);
      } else if (type === 'palette') {
          // Read settings via the ref so a colorSpace/manualWeights change that
          // arrived AFTER processImageFile was memoized still applies to this
          // extraction. activePaletteRef is already up-to-date for locked colors.
          const liveSettings = settingsRef.current;
          const canv = document.createElement('canvas'); canv.width = 128; canv.height = 128;
          const ctx = canv.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
          const data = ctx.getImageData(0, 0, 128, 128);
          // Pass [] for the locked-seed argument so a previous Extract-from-Image
          // (which leaves every color locked) doesn't short-circuit a hull-style
          // extractor that respects locked seeds. Then lock every fresh color so
          // the auto-extract effect doesn't replace them on the next source /
          // settings bump.
          const np = runExtractor(liveSettings.paletteExtractor || 'hull', data.data, liveSettings.paletteSize, liveSettings, []);
          const locked = np.map(c => ({ ...c, locked: true }));
          if (locked.length > 0) setActivePalette(sortPalette(locked, liveSettings.sortMode));
      }
      setLoading(false);
    };
    // Without this the loading overlay sticks forever if the picked file fails
    // to decode (HEIC, corrupted JPEG, animated AVIF, etc).
    img.onerror = () => {
      console.warn('processImageFile: failed to decode', file?.name);
      setLoading(false);
    };
    img.src = url;
  }, [extractFrameFromSource]);

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
        const np = runExtractor(settings.paletteExtractor || 'hull', sourceDataRef.current.pixels, settings.paletteSize, settings, locked);
        setActivePalette(sortPalette(np, settings.sortMode));
    }, 50);
    return () => clearTimeout(timer);
  }, [sourceVersion, settings.paletteSize, settings.contrastEnhancement, settings.colorSpace, settings.genSeed, settings.sortMode, settings.paletteExtractor, recalcTrigger, isRenderingVideo]);

  // Adaptive render debounce. The render effect is the heaviest in the app, so we want it
  // throttled — but rate-of-arrival is the right signal, not a single constant. Rapid
  // back-to-back changes (video scrubbing, slider drags) use 16ms so the canvas stays
  // responsive. Isolated changes (a single click — typically followed 50ms later by the
  // auto-extract that re-orders the palette) use 80ms, longer than the extract delay, so
  // both state updates collapse into a single render instead of rendering twice.
  const lastRenderTriggerRef = useRef(0);

  useEffect(() => {
    if (!sourceDataRef.current || !canvasRef.current || activePalette.length === 0 || isRenderingVideo) return;
    const now = performance.now();
    const sinceLast = now - lastRenderTriggerRef.current;
    lastRenderTriggerRef.current = now;
    const debounceMs = sinceLast < 120 ? 16 : 80;
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
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [activePalette, sourceVersion, settings, isRenderingVideo]);

  const handleVideoSeek = (time) => { setVideoCurrentTime(time); if (videoRef.current) videoRef.current.currentTime = time; };

  const handleGifSeek = (frameIdx) => {
      setGifCurrentFrame(frameIdx);
      if (gifFramesRef.current[frameIdx]) {
          extractFrameFromSource(gifFramesRef.current[frameIdx].canvas);
      }
  };

  // Unified source-frame iterator. Returns whatever an animated input has -- decoded GIF
  // frames OR seekable video frames -- behind a single interface, so that the GIF encoder
  // and the video encoder can each accept either input. This is what lets the user choose
  // the output format independently of the input format.
  const buildSourceFrameIterator = async () => {
      const VIDEO_FPS = settingsRef.current.videoFps || 30;
      if (isGif && gifFramesRef.current.length > 0) {
          const frames = gifFramesRef.current;
          return {
              count: frames.length,
              getFrame: async (i) => frames[i].canvas,
              getDisposal: (i) => frames[i].disposal || 1,
              cleanup: () => {},
          };
      }
      if (isVideo && videoRef.current) {
          const video = videoRef.current;
          const totalFrames = Math.floor((videoDuration || 0) * VIDEO_FPS);
          const prevOnSeeked = video.onseeked;
          video.onseeked = null;
          return {
              count: totalFrames,
              getFrame: async (i) => {
                  video.currentTime = i / VIDEO_FPS;
                  await new Promise(r => {
                      const handler = () => { video.removeEventListener('seeked', handler); r(); };
                      video.addEventListener('seeked', handler);
                  });
                  return video;
              },
              getDisposal: () => 1,
              cleanup: () => {
                  video.onseeked = prevOnSeeked || ((e) => {
                      if (isRenderingVideo) return;
                      setVideoCurrentTime(e.target.currentTime);
                      extractFrameFromSource(e.target);
                  });
                  video.currentTime = videoCurrentTime;
              },
          };
      }
      return null;
  };

  const handleRenderGif = async () => {
      const iter = await buildSourceFrameIterator();
      if (!iter || iter.count === 0) return;
      setIsRenderingVideo(true); setRenderPhase('Encoding GIF'); setRenderProgress(0);

      const w = settingsRef.current.width; const h = settingsRef.current.height;
      const fps = settingsRef.current.videoFps || 30;
      const delay = Math.max(2, Math.round(100 / fps));

      // For dither modes the rendered output is exactly the user palette, so
      // we can build the GIF palette once and reuse it across frames. For
      // mixing modes (linear-projection / paper-beer-lambert / paper-mixbox)
      // the renderer emits interpolated colors that don't exist in the user
      // palette; we build a per-frame palette from the actual rendered
      // pixels (up to 255 colors + 1 transparency = 256, the GIF max) so the
      // gradients survive instead of being clipped.
      // "None" and the mixing modes (linear-projection / paper-*) emit pixels
      // outside the user palette, so the GIF needs a per-frame palette built
      // from the actual rendered colors rather than the user palette.
      const isMixingMode = ['none', 'linear-projection', 'paper-beer-lambert', 'paper-mixbox'].includes(settingsRef.current.ditherSubMethod);

      // Build the GIF-frame state (palette, transparentIndex, paletteToUse,
      // colorCache) from a flat list of RGB ints.
      const makePaletteState = (rgbInts) => {
          const transparentIndex = rgbInts.length;
          let targetLen = 2;
          while (targetLen < rgbInts.length + 1 && targetLen <= 256) targetLen <<= 1;
          const paletteToUse = [...rgbInts, 0x000000];
          while (paletteToUse.length < targetLen) paletteToUse.push(0);
          const colorCache = new Map();
          rgbInts.forEach((c, i) => colorCache.set(c, i));
          return { customPalette: rgbInts, transparentIndex, paletteToUse, colorCache };
      };

      // For non-mixing modes, build once from the user palette.
      const fixedState = isMixingMode
          ? null
          : makePaletteState(activePaletteRef.current.map(c => (c.displayR << 16) | (c.displayG << 8) | c.displayB));

      // Overestimate buffer to prevent capacity issues
      const bufSize = Math.max(1024 * 1024 * 5, 1024 + (iter.count * w * h * 3));
      const buffer = new Uint8Array(bufSize);
      const writer = new GifWriter(buffer, w, h, { loop: 0 });

      for (let i = 0; i < iter.count; i++) {
          const frame = await iter.getFrame(i);
          extractFrameFromSource(frame);
          renderDitheredImage(canvasRef.current, sourceDataRef.current, activePaletteRef.current, settingsRef.current);

          const ctx = canvasRef.current.getContext('2d');
          const rgba = ctx.getImageData(0, 0, w, h).data;

          const state = fixedState ?? makePaletteState(
              buildGifPalette(rgba, 255).map(([r, g, b]) => (r << 16) | (g << 8) | b)
          );
          const { customPalette, transparentIndex, paletteToUse, colorCache } = state;

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
              delay,
              disposal: iter.getDisposal(i),
          };
          if (hasTransparency) options.transparent = transparentIndex;

          writer.addFrame(0, 0, w, h, indexedPixels, options);
          setRenderProgress((i + 1) / iter.count);
          await new Promise(r => setTimeout(r, 0));
      }

      const finalBuffer = buffer.slice(0, writer.end());
      const blob = new Blob([finalBuffer], { type: 'image/gif' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = 'dithered-animation.gif'; link.click();

      iter.cleanup();
      setIsRenderingVideo(false); setRenderPhase('');
  };

  const handleRenderVideo = async () => {
      const iter = await buildSourceFrameIterator();
      if (!iter || iter.count === 0 || !canvasRef.current) return;
      setIsRenderingVideo(true); setRenderPhase('Extracting Frames'); setRenderProgress(0);

      const VIDEO_FPS = settingsRef.current.videoFps || 30;
      const renderedFrames = [];

      for (let i = 0; i < iter.count; i++) {
          const frame = await iter.getFrame(i);
          extractFrameFromSource(frame);
          renderDitheredImage(canvasRef.current, sourceDataRef.current, activePaletteRef.current, settingsRef.current);
          const bitmap = await createImageBitmap(canvasRef.current);
          renderedFrames.push(bitmap);
          setRenderProgress((i + 1) / iter.count);
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
          if (targetFrame > frameIdx && targetFrame < iter.count) {
              frameIdx = targetFrame; ctx.drawImage(renderedFrames[frameIdx], 0, 0); setRenderProgress(frameIdx / iter.count);
          }
          if (frameIdx < iter.count - 1) requestAnimationFrame(playNextFrame);
          else setTimeout(() => recorder.stop(), frameDurationMs);
      };

      requestAnimationFrame(playNextFrame); await recordingPromise;
      renderedFrames.forEach(bmp => bmp.close && bmp.close());
      iter.cleanup();
      setIsRenderingVideo(false); setRenderPhase('');
  };

  const resetView = useCallback(() => {
      if (containerRef.current) {
          const cw = containerRef.current.clientWidth, ch = containerRef.current.clientHeight;
          const fit = Math.min((cw * 0.9) / settings.width, (ch * 0.9) / settings.height, 8);
          // Snap the fit scale down to the nearest clean zoom level (…, 1/2, 1, 2, 3, …)
          // so the initial view lands on a discrete level instead of a fractional one.
          const scale = floorZoomSnap(fit);
          // resetView sets the *target*; the RAF loop will animate display toward it.
          setViewState(v => ({ ...v, scale, x: 0, y: 0 }));
      }
  }, [settings.width, settings.height]);

  // RAF loop: lerps displayViewState toward viewState (the target). Log-space for scale
  // so zoom changes feel proportional; linear for pan. Returns the same object when
  // settled, so React skips the re-render and the loop becomes a cheap no-op.
  // Pattern adapted from user's reference image-viewer prototype.
  useEffect(() => {
      let rafId;
      const animate = () => {
          setDisplayViewState(prev => {
              const target = viewStateRef.current;
              const logD = Math.log(prev.scale), logT = Math.log(target.scale);
              const newScale = Math.abs(logT - logD) > 0.005 ? Math.exp(logD + (logT - logD) * 0.2) : target.scale;
              const newX = Math.abs(target.x - prev.x) > 0.5 ? prev.x + (target.x - prev.x) * 0.2 : target.x;
              const newY = Math.abs(target.y - prev.y) > 0.5 ? prev.y + (target.y - prev.y) * 0.2 : target.y;
              if (newScale === prev.scale && newX === prev.x && newY === prev.y) return prev;
              return { scale: newScale, x: newX, y: newY };
          });
          rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafId);
  }, []);

  // Apply a zoom level while keeping the canvas pixel under the cursor stationary.
  // Default to container-center when no cursor coords are passed (used by toolbar buttons).
  // Math: cursor offset from container center → canvas-local coordinate (under cursor)
  // → new pan such that the same local coordinate still lands at the cursor at newScale.
  const applyZoomCentered = useCallback((newScale, clientX, clientY) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = clientX !== undefined ? clientX : rect.left + rect.width / 2;
      const py = clientY !== undefined ? clientY : rect.top + rect.height / 2;
      const cx = px - rect.left - rect.width / 2;
      const cy = py - rect.top - rect.height / 2;
      const cur = viewStateRef.current;
      const unscaledX = (cx - cur.x) / cur.scale;
      const unscaledY = (cy - cur.y) / cur.scale;
      const newX = cx - unscaledX * newScale;
      const newY = cy - unscaledY * newScale;
      setViewState(v => ({ ...v, scale: newScale, x: newX, y: newY, isFit: false }));
  }, []);

  // Snap to nearest clean zoom level, but only after the wheel has been idle 200ms.
  // Skips snapping if the user has clearly stopped between snap points (>15% relative
  // distance) — that's an intentional zoom level, don't override it.
  const snapTimeoutRef = useRef(null);
  const triggerSnap = useCallback((clientX, clientY) => {
      clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = setTimeout(() => {
          const cur = viewStateRef.current.scale;
          const snap = nearestZoomSnap(cur);
          if (cur !== snap) {
              applyZoomCentered(snap, clientX, clientY);
          }
      }, 100);
  }, [applyZoomCentered]);

  useEffect(() => {
      if (!viewState.isFit) return;
      // Defer the layout-forcing clientWidth/Height read until both: (a) the document
      // is fully loaded so stylesheets are settled, and (b) the next paint frame, so
      // we never force layout against unstyled DOM. requestAnimationFrame alone isn't
      // enough -- on slow CSS loads, the next frame can still happen pre-stylesheet.
      let rafId = 0;
      const run = () => { rafId = requestAnimationFrame(() => resetView()); };
      if (document.readyState === 'complete') {
          run();
      } else {
          window.addEventListener('load', run, { once: true });
          return () => { window.removeEventListener('load', run); if (rafId) cancelAnimationFrame(rafId); };
      }
      return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [settings.width, settings.height, viewState.isFit, resetView]);

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

  const handleExportLayers = async (style, mode) => {
      if (!sourceDataRef.current || !canvasRef.current || activePaletteRef.current.length === 0) return;
      setIsRenderingVideo(true); setRenderPhase('Generating Layers'); setRenderProgress(0);
      try {
          const JSZipModule = await import('https://esm.sh/jszip');
          const JSZip = JSZipModule.default || JSZipModule;
          const zip = new JSZip();
          const { width, height, pixels: rawPixels } = sourceDataRef.current;
          // Apply the pre-dither color grade to a copy of the source pixels
          // when enabled. The dither pipeline below reads from `srcPixels`,
          // so this keeps the export consistent with the on-screen render.
          const transferMode = settingsRef.current.colorTransfer;
          const srcPixels = (transferMode && transferMode !== 'none')
              ? (() => { const copy = new Uint8ClampedArray(rawPixels); applyColorTransfer(copy, activePaletteRef.current, transferMode); return copy; })()
              : rawPixels;
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');

          const isLinear = settingsRef.current.ditherSubMethod === 'linear-projection';
          const isBeerLambert = settingsRef.current.ditherSubMethod === 'paper-beer-lambert';
          const isMixbox = settingsRef.current.ditherSubMethod === 'paper-mixbox';
          const mixboxReady = isMixbox && window.mixbox && window.mixbox.LATENT_SIZE;
          const isProjection = isLinear || isBeerLambert || isMixbox;
          
          const D = mixboxReady ? window.mixbox.LATENT_SIZE : 3;
          const P = activePaletteRef.current.length;

          let csvContent = "Layer,Hex,R,G,B\n";
          activePaletteRef.current.forEach((c, i) => {
              const hex = rgbToHex(c.displayR, c.displayG, c.displayB);
              const layerNum = String(i + 1).padStart(3, '0');
              csvContent += `${layerNum},${hex},${c.displayR},${c.displayG},${c.displayB}\n`;
          });
          zip.file("palette.csv", csvContent);

          if (isProjection) {
              const layerWeights = Array.from({length: P}, () => new Float32Array(width * height));
              const Converter = ColorSpaceConverter[settingsRef.current.colorSpace];
              const w0 = settingsRef.current.colorSpace === 'srgb' || settingsRef.current.colorSpace === 'linear' ? Math.sqrt(settingsRef.current.manualWeights.r) : 1;
              const w1 = settingsRef.current.colorSpace === 'srgb' || settingsRef.current.colorSpace === 'linear' ? Math.sqrt(settingsRef.current.manualWeights.g) : 1;
              const w2 = settingsRef.current.colorSpace === 'srgb' || settingsRef.current.colorSpace === 'linear' ? Math.sqrt(settingsRef.current.manualWeights.b) : 1;

              const workingPalette = activePaletteRef.current.map(p => {
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
                  workingPalette.push({
                      isWhitePaper: true,
                      transformed: window.mixbox.rgbToLatent([255, 255, 255])
                  });
              }

              const fwWeights = new Float32Array(workingPalette.length);
              const fwCurrentPos = new Float32Array(D);
              const fwError = new Float32Array(D);
              const fwDelta = new Float32Array(D);

              const runFW = (vArr) => {
                  const W_P = workingPalette.length;
                  fwWeights.fill(0);
                  
                  let bestStartIdx = 0, minDist = Infinity;
                  for (let p = 0; p < W_P; p++) {
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

                      let minDot = Infinity, bestIdx = -1;
                      for (let p = 0; p < W_P; p++) {
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
                      for (let p = 0; p < W_P; p++) fwWeights[p] *= (1 - gamma);
                      fwWeights[bestIdx] += gamma;
                  }
              };

              const runBoundedCD = (vArr) => {
                  const W_P = workingPalette.length;
                  fwWeights.fill(0);
                  for (let k = 0; k < D; k++) fwError[k] = -vArr[k];

                  for (let iter = 0; iter < 20; iter++) {
                      let maxChange = 0;
                      for (let p = 0; p < W_P; p++) {
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

              for (let i = 0, pIdx=0; i < srcPixels.length; i += 4, pIdx++) {
                  if (srcPixels[i+3] < 128) continue;
                  
                  let vArr;
                  if (isBeerLambert) {
                      const [lr, lg, lb] = ColorSpaceConverter.linear.to(srcPixels[i], srcPixels[i+1], srcPixels[i+2]);
                      vArr = [-Math.log(Math.max(lr, 0.001)), -Math.log(Math.max(lg, 0.001)), -Math.log(Math.max(lb, 0.001))];
                  } else if (mixboxReady) {
                      vArr = window.mixbox.rgbToLatent([srcPixels[i], srcPixels[i+1], srcPixels[i+2]]);
                  } else {
                      const [v0Raw, v1Raw, v2Raw] = Converter.to(srcPixels[i], srcPixels[i+1], srcPixels[i+2]);
                      vArr = [v0Raw * w0, v1Raw * w1, v2Raw * w2];
                  }

                  if (isBeerLambert) {
                      runBoundedCD(vArr);
                  } else {
                      runFW(vArr);
                  }

                  // Note: Always loop to P so it ignores the white paper base if it was added implicitly
                  for (let p = 0; p < P; p++) layerWeights[p][pIdx] = fwWeights[p];
              }

              for (let p = 0; p < P; p++) {
                  const imgData = new ImageData(width, height);
                  const targetC = activePaletteRef.current[p];
                  for (let i = 0; i < width * height; i++) {
                      const val = clamp(Math.round(layerWeights[p][i] * 255), 0, 255);
                      if (mode === 'color') {
                          imgData.data[i*4] = targetC.displayR;
                          imgData.data[i*4+1] = targetC.displayG;
                          imgData.data[i*4+2] = targetC.displayB;
                          imgData.data[i*4+3] = srcPixels[i*4+3] < 128 ? 0 : val;
                      } else {
                          imgData.data[i*4] = val;
                          imgData.data[i*4+1] = val;
                          imgData.data[i*4+2] = val;
                          imgData.data[i*4+3] = srcPixels[i*4+3] < 128 ? 0 : 255;
                      }
                  }
                  ctx.putImageData(imgData, 0, 0);
                  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                  const hex = rgbToHex(activePaletteRef.current[p].displayR, activePaletteRef.current[p].displayG, activePaletteRef.current[p].displayB);
                  zip.file(`${String(p+1).padStart(3, '0')}-${hex.substring(1)}.png`, blob);
                  setRenderProgress((p + 1) / P);
              }
          } else if (style === 'progressive') {
              for (let p = 0; p < P; p++) {
                  const tempPalette = activePaletteRef.current.slice(0, p + 1);
                  const tempCanvas = document.createElement('canvas');
                  tempCanvas.width = width; tempCanvas.height = height;
                  renderDitheredImage(tempCanvas, sourceDataRef.current, tempPalette, settingsRef.current);
                  
                  const tempCtx = tempCanvas.getContext('2d');
                  const renderedPixels = tempCtx.getImageData(0, 0, width, height).data;
                  const imgData = new ImageData(width, height);
                  const targetC = activePaletteRef.current[p];
                  
                  for (let i = 0; i < renderedPixels.length; i += 4) {
                      if (renderedPixels[i+3] < 128) continue;
                      
                      let isTarget = false;
                      if (p === 0) {
                          isTarget = true; 
                      } else {
                          const r = renderedPixels[i], g = renderedPixels[i+1], b = renderedPixels[i+2];
                          if (r === targetC.displayR && g === targetC.displayG && b === targetC.displayB) isTarget = true;
                      }
                      
                      if (isTarget) {
                          if (mode === 'color') {
                              imgData.data[i] = targetC.displayR; imgData.data[i+1] = targetC.displayG; imgData.data[i+2] = targetC.displayB; imgData.data[i+3] = 255;
                          } else {
                              imgData.data[i] = 0; imgData.data[i+1] = 0; imgData.data[i+2] = 0; imgData.data[i+3] = 255;
                          }
                      }
                  }
                  ctx.putImageData(imgData, 0, 0);
                  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                  const hex = rgbToHex(targetC.displayR, targetC.displayG, targetC.displayB);
                  zip.file(`${String(p+1).padStart(3, '0')}-${hex.substring(1)}.png`, blob);
                  setRenderProgress((p + 1) / P);
              }
          } else {
              const renderedCtx = canvasRef.current.getContext('2d');
              const renderedPixels = renderedCtx.getImageData(0, 0, width, height).data;

              const colorMap = new Map();
              activePaletteRef.current.forEach((c, i) => {
                  const key = (c.displayR << 16) | (c.displayG << 8) | c.displayB;
                  colorMap.set(key, i);
              });

              const pixelIndices = new Int32Array(width * height);
              for (let i = 0; i < renderedPixels.length; i += 4) {
                  if (renderedPixels[i+3] < 128) {
                      pixelIndices[i/4] = -1;
                  } else {
                      const r = renderedPixels[i], g = renderedPixels[i+1], b = renderedPixels[i+2];
                      const key = (r << 16) | (g << 8) | b;
                      let idx = colorMap.get(key);
                      if (idx === undefined) {
                          let minDist = Infinity;
                          for (let j = 0; j < P; j++) {
                              const c = activePaletteRef.current[j];
                              const dr = r - c.displayR, dg = g - c.displayG, db = b - c.displayB;
                              const dist = dr*dr + dg*dg + db*db;
                              if (dist < minDist) { minDist = dist; idx = j; }
                          }
                          colorMap.set(key, idx);
                      }
                      pixelIndices[i/4] = idx;
                  }
              }

              for (let p = 0; p < P; p++) {
                  const imgData = new ImageData(width, height);
                  const targetC = activePaletteRef.current[p];
                  for (let i = 0; i < width * height; i++) {
                      const idx = pixelIndices[i];
                      if (idx >= p) {
                          if (mode === 'color') {
                              imgData.data[i*4] = targetC.displayR; imgData.data[i*4+1] = targetC.displayG; imgData.data[i*4+2] = targetC.displayB; imgData.data[i*4+3] = 255;
                          } else {
                              imgData.data[i*4] = 0; imgData.data[i*4+1] = 0; imgData.data[i*4+2] = 0; imgData.data[i*4+3] = 255;
                          }
                      }
                  }
                  ctx.putImageData(imgData, 0, 0);
                  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
                  const hex = rgbToHex(targetC.displayR, targetC.displayG, targetC.displayB);
                  zip.file(`${String(p+1).padStart(3, '0')}-${hex.substring(1)}.png`, blob);
                  setRenderProgress((p + 1) / P);
              }
          }

          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(zipBlob);
          link.download = `color-layers-${style}-${mode}.zip`;
          link.click();
      } catch (e) {
          console.error("Export layers failed", e);
          alert("Failed to export layers. Check console.");
      } finally {
          setIsRenderingVideo(false);
          setRenderPhase('');
      }
  };

  // Accepts a File (from <input> change, drag-drop, or fetch from Lospec). Parses any text
  // file containing hex codes (.hex / .gpl / .pal / .json all work) -- it's a regex-and-go
  // approach, not strict format parsing, but it covers ~every palette file on the web.
  const handlePaletteImport = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      // Match both #RRGGBB and bare RRGGBB (the Lospec API returns the latter).
      const hexMatches = (text.match(/#?[0-9A-Fa-f]{6}\b/g) || []).map(h => h.startsWith('#') ? h : '#' + h);
      if (hexMatches.length > 0) {
          const newPalette = hexMatches.map((hex, i) => {
              const [r, g, b] = hexToRgb(hex);
              return { r, g, b, displayR: r, displayG: g, displayB: b, offsetX: 0, offsetY: 0, locked: true, isNew: true, id: generateId(), impactIndex: i };
          });
          const capped = newPalette.slice(0, 256); setActivePalette(capped); setSettings(s => ({ ...s, paletteSize: capped.length })); setRecalcTrigger(n => n + 1);
      } else { alert("No valid hex codes found in file."); }
    };
    reader.readAsText(file);
  };

  // True if the dropped/uploaded filename looks like a palette rather than an image/video.
  const PALETTE_EXTENSIONS = ['.hex', '.gpl', '.pal', '.json', '.txt', '.aco', '.ase'];
  const isPaletteFile = (file) => {
    if (!file?.name) return false;
    const name = file.name.toLowerCase();
    return PALETTE_EXTENSIONS.some(ext => name.endsWith(ext));
  };

  const handlePaletteExport = (format) => {
      if (activePalette.length === 0) return;
      if (format === 'zip: Cricut (Color)') { handleExportLayers('cricut', 'color'); return; }
      if (format === 'zip: Cricut (B&W)') { handleExportLayers('cricut', 'bw'); return; }
      if (format === 'zip: Progressive (Color)') { handleExportLayers('progressive', 'color'); return; }
      if (format === 'zip: Progressive (B&W)') { handleExportLayers('progressive', 'bw'); return; }
      if (format === 'zip: Color') { handleExportLayers('progressive', 'color'); return; }
      if (format === 'zip: B&W') { handleExportLayers('progressive', 'bw'); return; }
      
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
  // Drag uses displayViewState (the actually-visible position) so picking up mid-animation
  // doesn't cause the image to jump. setViewStateImmediate syncs target+display together
  // so the drag stays 1:1 with the cursor (no lerp lag).
  const handleMouseDown = (e) => { if (imageSrc) {
      const d = displayViewStateRef.current;
      setIsPanning(true);
      setDragStart({ x: e.clientX - d.x, y: e.clientY - d.y });
      setViewStateImmediate(v => ({ ...v, x: d.x, y: d.y, scale: d.scale, isFit: false }));
  }};
  const handleMouseMove = (e) => { if (isPanning) setViewStateImmediate(v => ({ ...v, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })); };

  const handleTouchStart = (e) => {
      if (!imageSrc) return;
      const d = displayViewStateRef.current;
      if (e.touches.length === 1) {
          setIsPanning(true);
          setDragStart({ x: e.touches[0].clientX - d.x, y: e.touches[0].clientY - d.y });
          setViewStateImmediate(v => ({ ...v, x: d.x, y: d.y, scale: d.scale, isFit: false }));
      }
      else if (e.touches.length === 2) {
          setIsPanning(false);
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          touchState.current.initialDist = Math.hypot(dx, dy);
          touchState.current.initialScale = d.scale;
      }
  };
  const handleTouchMove = (e) => {
      if (!imageSrc) return;
      if (e.touches.length === 1 && isPanning) setViewStateImmediate(v => ({ ...v, x: e.touches[0].clientX - dragStart.x, y: e.touches[0].clientY - dragStart.y }));
      else if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          if (touchState.current.initialDist > 0) {
              const newScale = clamp(touchState.current.initialScale * (dist / touchState.current.initialDist), 0.015625, 64);
              const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
              const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
              applyZoomCentered(newScale, cx, cy);
              triggerSnap(cx, cy);
          }
      }
  };
  const handleTouchEnd = (e) => {
      if (e.touches.length < 2) touchState.current.initialDist = 0;
      if (e.touches.length === 0) setIsPanning(false);
      else if (e.touches.length === 1) {
          const d = displayViewStateRef.current;
          setDragStart({ x: e.touches[0].clientX - d.x, y: e.touches[0].clientY - d.y });
          setIsPanning(true);
      }
  };

  return (
    <div className="flex flex-col-reverse md:flex-row h-screen w-full overflow-hidden transition-colors duration-300 bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100" onClick={() => setPickerOpenId(null)}>
      {(isRenderingVideo || loading) && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-neutral-950/90 backdrop-blur-sm text-white">
              <RefreshCw className="w-10 h-10 animate-spin mb-6 text-neutral-400" />
              <span className="text-sm font-bold uppercase tracking-widest mb-2">{isRenderingVideo ? renderPhase : loadingMsg}</span>
              {isRenderingVideo && (
                  <>
                    <div className="w-64 h-1.5 bg-neutral-800 mt-2"><div className="h-full bg-white" style={{ width: `${Math.max(0, renderProgress) * 100}%` }}></div></div>
                    <span className="text-xs font-bold tracking-widest mt-3 text-neutral-400">{Math.round(renderProgress * 100)}%</span>
                  </>
              )}
          </div>
      )}

      <div className="w-full md:w-[320px] flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-r z-10 shadow-2xl h-1/2 md:h-full min-h-0 bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
           onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
           onDrop={e => {
               e.preventDefault();
               const file = e.dataTransfer.files?.[0];
               if (!file) return;
               // Inside the palette panel, palette files always import as palettes; image files
               // import as images (mirroring the canvas drop behaviour).
               if (isPaletteFile(file)) handlePaletteImport(file);
               else processImageFile(file);
           }}>
          <div className="p-4 border-b flex items-center justify-between flex-shrink-0 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center gap-2 min-w-0">
                  <button onClick={() => setIsReferencesOpen(true)} title="View citations for the current configuration" className="flex-shrink-0 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors">
                      <Layers className="w-5 h-5" />
                  </button>
                  <h1 className="app-title truncate">Micah's Colors</h1>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                  {imageSrc && (
                      <IconButton
                          icon={(isVideo || isGif) ? ImageIcon : Download}
                          onClick={() => {
                              if (!canvasRef.current) return;
                              const link = document.createElement('a');
                              link.download = (isVideo || isGif) ? 'pixel-frame.png' : 'pixel-art.png';
                              link.href = canvasRef.current.toDataURL();
                              link.click();
                          }}
                          title={(isVideo || isGif) ? "Save Current Frame as PNG" : "Save Image as PNG"}
                      />
                  )}
                  {(isVideo || isGif) && (
                      <>
                          <IconButton
                              icon={ImagePlay}
                              onClick={handleRenderGif}
                              title="Render as Animated GIF"
                          />
                          <IconButton
                              icon={Film}
                              onClick={handleRenderVideo}
                              title="Render as Video (WebM/MP4)"
                          />
                      </>
                  )}
                  {imageSrc && <div className="w-px h-4 mx-1 bg-neutral-300 dark:bg-neutral-700"></div>}
                  <IconButton icon={FolderOpen} onClick={() => document.getElementById('main-upload')?.click()} title="Open Image / Video / GIF" />
              </div>
              <input type="file" id="main-upload" className="hidden" accept="image/*,video/*,image/gif" onChange={(e) => processImageFile(e.target.files?.[0])} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-3">
              <ImageSetupPanel settings={settings} updateSetting={updateSetting} imageLoaded={!!imageSrc} onResetOriginalSize={() => setSettings(s => ({...s, width: lastSourceInfoRef.current.w, height: lastSourceInfoRef.current.h}))} isAnimation={isVideo || isGif} />
              <div className={cls.divider}></div>
              <ColorsPanel settings={settings} updateSetting={updateSetting} />
              <div className={cls.divider}></div>
              <PalettePanel
                  settings={settings} updateSetting={updateSetting} paletteData={{ displayed: activePalette }}
                  onPaletteAction={{ 
                      extractFromImage: (file) => processImageFile(file, 'palette'), 
                      toggleAllLocks: (locked) => { setActivePalette(prev => prev.map(c => ({...c, locked}))); setRecalcTrigger(n => n + 1); }, 
                      openLibrary: () => setIsLibraryOpen(true), 
                      import: handlePaletteImport, 
                      export: handlePaletteExport, 
                      randomizeOffsets: () => { setActivePalette(prev => prev.map(c => c.locked ? { ...c, offsetX: Math.floor(Math.random() * 32), offsetY: Math.floor(Math.random() * 32) } : c)); }, 
                      deleteColor: (id) => {
                          setActivePalette(prev => prev.filter(c => c.id !== id));
                          setSettings(s => ({ ...s, paletteSize: Math.max(2, s.paletteSize - 1) }));
                          setRecalcTrigger(n => n + 1);
                      },
                      toggleLock: (id) => {
                          setActivePalette(prev => prev.map(c => c.id === id ? { ...c, locked: !c.locked } : c));
                          setRecalcTrigger(n => n + 1);
                      },
                      openEditor: (id, target) => {
                          const rect = target.getBoundingClientRect();
                          const left = Math.max(10, Math.min(window.innerWidth - 220, rect.left - 40));
                          const top = Math.max(10, rect.top - 200); 
                          setPickerPosition({ top, left }); 
                          setPickerOpenId(id);
                      } 
                  }} 
              />
              <div className={cls.divider}></div>
              <DitheringPanel settings={settings} updateSetting={updateSetting} paletteData={{ displayed: activePalette }} onPaletteAction={{ randomizeOffsets: () => setActivePalette(prev => prev.map(c => c.locked ? { ...c, offsetX: Math.floor(Math.random() * 32), offsetY: Math.floor(Math.random() * 32) } : c)) }} />
          </div>
      </div>

      <main className="flex-1 relative overflow-hidden flex flex-col h-full bg-neutral-100 dark:bg-black" onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (isPaletteFile(file)) handlePaletteImport(file);
          else processImageFile(file);
      }}>
        {!imageSrc && <div onClick={() => document.getElementById('main-upload')?.click()} className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 cursor-pointer"><ImageIcon className="w-10 h-10 mb-4 opacity-20" /><p>Open/drag an image/video/GIF</p></div>}
        
        {imageSrc && (
            <div 
                ref={containerRef} 
                className="flex-1 relative overflow-hidden cursor-move" 
                style={{ touchAction: 'none' }}
                onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsPanning(false)} onMouseLeave={() => setIsPanning(false)}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                onWheel={e => {
                    // Multiplicative exponential zoom — each tick is a consistent percentage
                    // change regardless of current zoom. Cursor-anchored. Soft snap fires
                    // 200ms after the wheel goes idle so scrolling itself stays free.
                    const factor = Math.exp(-e.deltaY * 0.002);
                    const newScale = clamp(viewStateRef.current.scale * factor, 0.015625, 64);
                    applyZoomCentered(newScale, e.clientX, e.clientY);
                    triggerSnap(e.clientX, e.clientY);
                }}
            >
                <div className="w-full h-full flex items-center justify-center pointer-events-none relative">
                    
                    {/* ORIGINAL PREVIEW */}
                    <div 
                        className={`absolute transition-opacity duration-200 ${isComparing ? 'opacity-100 z-10' : 'opacity-0 z-0'}`} 
                        style={{ transform: `translate(${displayViewState.x}px, ${displayViewState.y}px) scale(${displayViewState.scale})`, width: settings.width, height: settings.height, willChange: 'transform' }}
                    >
                        <canvas 
                            ref={originalPixelCanvasRef} 
                            className="w-full h-full shadow-2xl" 
                            style={{ imageRendering: displayViewState.scale >= 1 ? 'pixelated' : 'auto', display: (displayViewState.scale >= 1 || !previewUrls.original) ? 'block' : 'none' }} 
                        />
                        {(displayViewState.scale < 1 && previewUrls.original) && (
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
                        style={{ transform: `translate(${displayViewState.x}px, ${displayViewState.y}px) scale(${displayViewState.scale})`, width: settings.width, height: settings.height, willChange: 'transform' }}
                    >
                        <canvas 
                            ref={canvasRef} 
                            className="w-full h-full shadow-2xl" 
                            style={{ imageRendering: displayViewState.scale >= 1 ? 'pixelated' : 'auto', display: (displayViewState.scale >= 1 || !previewUrls.dithered) ? 'block' : 'none' }} 
                        />
                        {(displayViewState.scale < 1 && previewUrls.dithered) && (
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
        
        {imageSrc && <FloatingToolbar
            zoom={displayViewState.scale}
            setZoom={z => {
                // Toolbar's numeric "zoom %" field: set target to typed value, viewport-centered.
                const newScale = typeof z === 'function' ? z(viewStateRef.current.scale) : z;
                applyZoomCentered(clamp(newScale, 0.015625, 64));
            }}
            isComparing={isComparing} onCompareStart={() => setIsComparing(true)} onCompareEnd={() => setIsComparing(false)}
            onCenter={() => setViewState(v => ({...v, x: 0, y: 0}))}
            onOneToOne={() => setViewState(v => ({...v, scale: 1, x: 0, y: 0, isFit: false}))}
            onFit={() => setViewState(v => ({...v, isFit: true}))}
            isAnimation={isVideo || isGif} isGif={isGif} gifTotalFrames={gifTotalFrames} gifCurrentFrame={gifCurrentFrame} onSeekGif={handleGifSeek} isVideo={isVideo} videoDuration={videoDuration} videoCurrentTime={videoCurrentTime} onSeekVideo={handleVideoSeek} settings={settings} />}
      </main>
      
      {pickerOpenId && <ColorEditor 
          color={activePalette.find(c => c.id === pickerOpenId)} 
          onClose={() => setPickerOpenId(null)} 
          onDelete={(id) => {
              setActivePalette(prev => prev.filter(c => c.id !== id));
              setSettings(s => ({ ...s, paletteSize: Math.max(2, s.paletteSize - 1) }));
              setPickerOpenId(null);
              setRecalcTrigger(n => n + 1);
          }}
          position={pickerPosition} 
          onUpdateLogic={(id, hex) => updateColor(id, hex, 'logic')} 
          onUpdatePaint={(id, hex) => updateColor(id, hex, 'paint')} 
          onToggleLock={(id) => { const np = [...activePalette]; const idx = np.findIndex(c => c.id === id); np[idx].locked = !np[idx].locked; setActivePalette(np); setRecalcTrigger(n => n + 1); }} 
          isLinked={isColorsLinked} 
          onToggleLink={() => setIsColorsLinked(!isColorsLinked)} 
          onUpdateOffset={updateColorOffset}
          settings={settings}
      />}

      <PaletteLibraryModal isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} onApply={handleApplyPreset} />

      <ReferencesModal isOpen={isReferencesOpen} onClose={() => setIsReferencesOpen(false)} settings={settings} />
      
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
                  setSettings(s => ({ ...s, aspectRatio: ar, width: initialWidth, height: initialHeight, originalFps: null }));
                  setViewState(v => ({ ...v, isFit: true })); e.target.currentTime = 0;
              }}
              onSeeked={(e) => { if (isRenderingVideo) return; setVideoCurrentTime(e.target.currentTime); extractFrameFromSource(e.target); }}
          />
      )}
    </div>
  );
}