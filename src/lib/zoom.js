// Zoom snap points: integer multipliers above 1, unit fractions 1/N below 1. Pixel-art zooms
// look cleanest (no moire from sub-pixel scaling) at these magnifications.
export const ZOOM_SNAPS = (() => {
    const snaps = [];
    for (let n = 64; n >= 2; n/=2) snaps.push(1 / n);  // 1/64 .. 1/2
    for (let n = 1; n <= 32; n++) snaps.push(n);      // 1, 2, .. 64
    return snaps;
})();

// Find the snap point closest to z (absolute distance). Used by post-idle snap.
export const nearestZoomSnap = (z) => {
    let best = ZOOM_SNAPS[0], bestDist = Infinity;
    for (const s of ZOOM_SNAPS) {
        const d = Math.abs(z - s);
        if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
};

// Step to the next snap point in a direction. Used by the +/- zoom buttons for discrete stepping.
export const nextZoomSnap = (current, direction) => {
    const eps = 1e-4;
    if (direction > 0) return ZOOM_SNAPS.find(s => s > current + eps) ?? ZOOM_SNAPS[ZOOM_SNAPS.length - 1];
    for (let i = ZOOM_SNAPS.length - 1; i >= 0; i--) if (ZOOM_SNAPS[i] < current - eps) return ZOOM_SNAPS[i];
    return ZOOM_SNAPS[0];
};

// Largest snap point ≤ z. Used by zoom-to-fit so the auto-fit scale lands
// on a clean integer (or 1/N) zoom rather than a fractional one — keeps
// pixel art crisp on initial load and matches the discrete levels offered
// by the +/- zoom buttons.
export const floorZoomSnap = (z) => {
    let best = ZOOM_SNAPS[0];
    for (const s of ZOOM_SNAPS) {
        if (s <= z) best = s;
        else break; // ZOOM_SNAPS is sorted ascending
    }
    return best;
};
