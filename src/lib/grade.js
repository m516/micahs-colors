// Pre-dither color transfer — three flavors plus a no-op. Each function
// mutates the RGBA `pixels` buffer in place and skips fully-transparent
// pixels when computing image statistics.
//
//   box       — translate + per-channel scale; maps the image's RGB
//               bounding box onto the palette's. Preserves darkness
//               relationships (image's darkest pixel maps to palette's
//               darkest), but ignores cross-channel correlation.
//
//   reinhard  — Reinhard 2001. Convert both palettes through Ruderman lαβ
//               (RGB → LMS → log10 → orthonormal opponent rotation), do
//               per-channel mean/std transfer in lαβ, invert. Theoretically
//               clean for natural-image sources because lαβ is
//               approximately decorrelated for natural-image ensembles.
//
//   xiao-ma   — Xiao & Ma 2006. Compute full 3×3 covariances in RGB,
//               eigendecompose both, build M = U_p · √(Λ_p/Λ_i) · U_iᵀ
//               and shift by means. Generalizes Reinhard's diagonal
//               Gaussian to any color cloud orientation. Sign-matches
//               eigenvectors so the principal axes align consistently.
//
// All three are "first- and second-moment" methods: they match the mean
// (always) and either per-channel variances (reinhard) or full covariance
// (xiao-ma). The bounding-box method instead matches range. None preserve
// hue or luminance ordering; if the palette mean is brighter than the
// image mean, dark pixels can land in the bright half — that's the
// algorithms' nature, not a bug. Use 'box' when darkness-preservation is
// what you want.

export const COLOR_TRANSFER_MODES = ['none', 'box', 'reinhard', 'xiao-ma'];

export const applyColorTransfer = (pixels, palette, mode) => {
    if (!mode || mode === 'none')      return;
    if (!palette || palette.length === 0) return;
    if (!pixels  || pixels.length === 0)  return;
    if (mode === 'box')      return gradeBoundingBox(pixels, palette);
    if (mode === 'reinhard') return gradeReinhard(pixels, palette);
    if (mode === 'xiao-ma')  return gradeXiaoMa(pixels, palette);
};

// =====================================================================
// 1. Bounding-box (translate + per-channel scale)
// =====================================================================

const gradeBoundingBox = (pixels, palette) => {
    let pMinR = 255, pMinG = 255, pMinB = 255;
    let pMaxR = 0,   pMaxG = 0,   pMaxB = 0;
    for (const c of palette) {
        if (c.r < pMinR) pMinR = c.r; if (c.r > pMaxR) pMaxR = c.r;
        if (c.g < pMinG) pMinG = c.g; if (c.g > pMaxG) pMaxG = c.g;
        if (c.b < pMinB) pMinB = c.b; if (c.b > pMaxB) pMaxB = c.b;
    }
    let iMinR = 255, iMinG = 255, iMinB = 255;
    let iMaxR = 0,   iMaxG = 0,   iMaxB = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        if (r < iMinR) iMinR = r; if (r > iMaxR) iMaxR = r;
        if (g < iMinG) iMinG = g; if (g > iMaxG) iMaxG = g;
        if (b < iMinB) iMinB = b; if (b > iMaxB) iMaxB = b;
    }
    const rangeR = iMaxR - iMinR, rangeG = iMaxG - iMinG, rangeB = iMaxB - iMinB;
    const scaleR = rangeR > 0 ? (pMaxR - pMinR) / rangeR : 0;
    const scaleG = rangeG > 0 ? (pMaxG - pMinG) / rangeG : 0;
    const scaleB = rangeB > 0 ? (pMaxB - pMinB) / rangeB : 0;
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i]     = pMinR + (pixels[i]     - iMinR) * scaleR;
        pixels[i + 1] = pMinG + (pixels[i + 1] - iMinG) * scaleG;
        pixels[i + 2] = pMinB + (pixels[i + 2] - iMinB) * scaleB;
    }
};

// =====================================================================
// 2. Reinhard 2001 — per-channel mean/std in Ruderman lαβ
// =====================================================================
//
// Canonical matrices from the paper. Verified against Han Gong's MATLAB
// reference and reproduced in HistomicsTK, dstein64/colortrans, etc.
// The 0.1288 and -0.2439 entries are typo-traps in some secondary sources.

const RGB_TO_LMS_00 = 0.3811, RGB_TO_LMS_01 = 0.5783, RGB_TO_LMS_02 = 0.0402;
const RGB_TO_LMS_10 = 0.1967, RGB_TO_LMS_11 = 0.7244, RGB_TO_LMS_12 = 0.0782;
const RGB_TO_LMS_20 = 0.0241, RGB_TO_LMS_21 = 0.1288, RGB_TO_LMS_22 = 0.8444;

const LMS_TO_RGB_00 =  4.4679, LMS_TO_RGB_01 = -3.5873, LMS_TO_RGB_02 =  0.1193;
const LMS_TO_RGB_10 = -1.2186, LMS_TO_RGB_11 =  2.3809, LMS_TO_RGB_12 = -0.1624;
const LMS_TO_RGB_20 =  0.0497, LMS_TO_RGB_21 = -0.2439, LMS_TO_RGB_22 =  1.2045;

const SQRT3 = Math.sqrt(3), SQRT6 = Math.sqrt(6), SQRT2 = Math.sqrt(2);
const INV_SQRT3 = 1 / SQRT3, INV_SQRT6 = 1 / SQRT6, INV_SQRT2 = 1 / SQRT2;

// 8-bit RGB → lαβ. Inputs in [0,255]; treats them as if linear (per the
// paper, which doesn't gamma-decode — every faithful reference imp also
// skips this step). Floor before log10 follows Han Gong's MATLAB.
const rgbToLab = (r, g, b) => {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const L = RGB_TO_LMS_00*rn + RGB_TO_LMS_01*gn + RGB_TO_LMS_02*bn;
    const M = RGB_TO_LMS_10*rn + RGB_TO_LMS_11*gn + RGB_TO_LMS_12*bn;
    const S = RGB_TO_LMS_20*rn + RGB_TO_LMS_21*gn + RGB_TO_LMS_22*bn;
    const FLOOR = 1 / 255;
    const lL = Math.log10(Math.max(L, FLOOR));
    const lM = Math.log10(Math.max(M, FLOOR));
    const lS = Math.log10(Math.max(S, FLOOR));
    const l     = (lL + lM + lS)      * INV_SQRT3;
    const alpha = (lL + lM - 2 * lS)  * INV_SQRT6;
    const beta  = (lL - lM)           * INV_SQRT2;
    return [l, alpha, beta];
};

// lαβ → 8-bit RGB. Inverse pipeline; final clip is handled by the caller's
// Uint8ClampedArray auto-clamp.
const labToRgb = (l, alpha, beta) => {
    // L = l/√3 + α/√6 + β/√2     (transpose of lαβ matrix)
    // M = l/√3 + α/√6 − β/√2
    // S = l/√3 − 2·α/√6
    const lL = l * INV_SQRT3 + alpha * INV_SQRT6 + beta * INV_SQRT2;
    const lM = l * INV_SQRT3 + alpha * INV_SQRT6 - beta * INV_SQRT2;
    const lS = l * INV_SQRT3 - 2 * alpha * INV_SQRT6;
    const L = Math.pow(10, lL);
    const M = Math.pow(10, lM);
    const S = Math.pow(10, lS);
    const r = LMS_TO_RGB_00*L + LMS_TO_RGB_01*M + LMS_TO_RGB_02*S;
    const g = LMS_TO_RGB_10*L + LMS_TO_RGB_11*M + LMS_TO_RGB_12*S;
    const b = LMS_TO_RGB_20*L + LMS_TO_RGB_21*M + LMS_TO_RGB_22*S;
    return [r * 255, g * 255, b * 255];
};

const gradeReinhard = (pixels, palette) => {
    // Palette stats in lαβ.
    let mPl = 0, mPa = 0, mPb = 0;
    const palLab = palette.map(c => {
        const lab = rgbToLab(c.r, c.g, c.b);
        mPl += lab[0]; mPa += lab[1]; mPb += lab[2];
        return lab;
    });
    const Np = palette.length;
    mPl /= Np; mPa /= Np; mPb /= Np;
    let sPl = 0, sPa = 0, sPb = 0;
    for (const lab of palLab) {
        sPl += (lab[0] - mPl) ** 2;
        sPa += (lab[1] - mPa) ** 2;
        sPb += (lab[2] - mPb) ** 2;
    }
    sPl = Math.sqrt(sPl / Np); sPa = Math.sqrt(sPa / Np); sPb = Math.sqrt(sPb / Np);

    // Image stats in lαβ (one pass: collect lab + accumulate).
    // For a 5k×5k image this is ~25M Float32 entries = 300MB — too much.
    // For typical pixel-art sizes (≤ 1k²) it's < 12MB. Cap with a streaming
    // two-pass approach: pass 1 computes stats, pass 2 transforms and
    // writes back. Each pass re-converts RGB→lαβ. Costs ~2× the math of a
    // one-pass cache, saves the memory.
    let mIl = 0, mIa = 0, mIb = 0, n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const lab = rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2]);
        mIl += lab[0]; mIa += lab[1]; mIb += lab[2];
        n++;
    }
    if (n === 0) return;
    mIl /= n; mIa /= n; mIb /= n;

    let sIl = 0, sIa = 0, sIb = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const lab = rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2]);
        sIl += (lab[0] - mIl) ** 2;
        sIa += (lab[1] - mIa) ** 2;
        sIb += (lab[2] - mIb) ** 2;
    }
    sIl = Math.sqrt(sIl / n); sIa = Math.sqrt(sIa / n); sIb = Math.sqrt(sIb / n);

    // Stable ratios (guard against zero-variance channels).
    const EPS = 1e-6;
    const rL = sIl > EPS ? sPl / sIl : 0;
    const rA = sIa > EPS ? sPa / sIa : 0;
    const rB = sIb > EPS ? sPb / sIb : 0;

    // Transfer + write back.
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const lab = rgbToLab(pixels[i], pixels[i + 1], pixels[i + 2]);
        const lP = rL * (lab[0] - mIl) + mPl;
        const aP = rA * (lab[1] - mIa) + mPa;
        const bP = rB * (lab[2] - mIb) + mPb;
        const rgb = labToRgb(lP, aP, bP);
        pixels[i]     = rgb[0];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[2];
    }
};

// =====================================================================
// 3. Xiao-Ma 2006 — full covariance transfer via eigendecomposition
// =====================================================================
//
// Symmetric 3×3 eigendecomposition by Jacobi rotation. Converges in ~5–10
// sweeps and is numerically stable through near-degenerate eigenvalues —
// unlike the closed-form Cardano + cross-product approach (which produces
// arbitrary directions when the null space exceeds rank 1, the dominant
// cause of speckle on near-grayscale palettes). Algorithm cribbed from the
// reference xiao-ma.jsx in the project root.
//
// Inputs: six unique entries of [[a,b,c],[b,d,e],[c,e,f]].
// Returns: { values: [λ1≥λ2≥λ3], vectors: 3×3 with eigenvectors as columns
//           (vectors[row][col] = (col-th eigenvector)[row]) }.
const jacobiEig3 = (a, b, c, d, e, f) => {
    const A = [[a, b, c], [b, d, e], [c, e, f]];
    const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const MAX_SWEEPS = 50;
    for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
        // Locate the largest off-diagonal entry — eliminating it gives the
        // biggest progress toward diagonal per rotation.
        let p = 0, q = 1, max = Math.abs(A[0][1]);
        if (Math.abs(A[0][2]) > max) { p = 0; q = 2; max = Math.abs(A[0][2]); }
        if (Math.abs(A[1][2]) > max) { p = 1; q = 2; max = Math.abs(A[1][2]); }
        if (max < 1e-14) break;
        // Standard Givens rotation that zeroes A[p][q].
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (theta >= 0)
            ? 1 / (theta + Math.sqrt(1 + theta * theta))
            : 1 / (theta - Math.sqrt(1 + theta * theta));
        const cs = 1 / Math.sqrt(1 + t * t);
        const sn = t * cs;
        const App = A[p][p], Aqq = A[q][q], Apq = A[p][q];
        A[p][p] = App - t * Apq;
        A[q][q] = Aqq + t * Apq;
        A[p][q] = 0; A[q][p] = 0;
        for (let i = 0; i < 3; i++) {
            if (i !== p && i !== q) {
                const Aip = A[i][p], Aiq = A[i][q];
                A[i][p] = cs * Aip - sn * Aiq; A[p][i] = A[i][p];
                A[i][q] = sn * Aip + cs * Aiq; A[q][i] = A[i][q];
            }
            const Vip = V[i][p], Viq = V[i][q];
            V[i][p] = cs * Vip - sn * Viq;
            V[i][q] = sn * Vip + cs * Viq;
        }
    }
    // Sort eigenvalues descending; permute eigenvector columns to match.
    const vals = [A[0][0], A[1][1], A[2][2]];
    const idx = [0, 1, 2].sort((x, y) => vals[y] - vals[x]);
    const sortedVals = [vals[idx[0]], vals[idx[1]], vals[idx[2]]];
    const sortedVecs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let row = 0; row < 3; row++)
        for (let col = 0; col < 3; col++)
            sortedVecs[row][col] = V[row][idx[col]];
    return { values: sortedVals, vectors: sortedVecs };
};

const gradeXiaoMa = (pixels, palette) => {
    // === Palette mean & covariance (μ_s, Σ_s with the "source = palette"
    //     convention from xiao-ma.md). ===
    const Np = palette.length;
    let mPR = 0, mPG = 0, mPB = 0;
    for (const c of palette) { mPR += c.r; mPG += c.g; mPB += c.b; }
    mPR /= Np; mPG /= Np; mPB /= Np;
    let pRR = 0, pGG = 0, pBB = 0, pRG = 0, pRB = 0, pGB = 0;
    for (const c of palette) {
        const dr = c.r - mPR, dg = c.g - mPG, db = c.b - mPB;
        pRR += dr*dr; pGG += dg*dg; pBB += db*db;
        pRG += dr*dg; pRB += dr*db; pGB += dg*db;
    }
    pRR /= Np; pGG /= Np; pBB /= Np;
    pRG /= Np; pRB /= Np; pGB /= Np;

    // === Image mean & covariance (μ_t, Σ_t — image is the "target" being
    //     recolored). Skip fully-transparent pixels. ===
    let mIR = 0, mIG = 0, mIB = 0, n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        mIR += pixels[i]; mIG += pixels[i + 1]; mIB += pixels[i + 2];
        n++;
    }
    if (n === 0) return;
    mIR /= n; mIG /= n; mIB /= n;
    let iRR = 0, iGG = 0, iBB = 0, iRG = 0, iRB = 0, iGB = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 128) continue;
        const dr = pixels[i] - mIR, dg = pixels[i + 1] - mIG, db = pixels[i + 2] - mIB;
        iRR += dr*dr; iGG += dg*dg; iBB += db*db;
        iRG += dr*dg; iRB += dr*db; iGB += dg*db;
    }
    iRR /= n; iGG /= n; iBB /= n;
    iRG /= n; iRB /= n; iGB /= n;

    const eigS = jacobiEig3(pRR, pRG, pRB, pGG, pGB, pBB); // palette / source
    const eigT = jacobiEig3(iRR, iRG, iRB, iGG, iGB, iBB); // image / target

    // Sign-match palette eigenvectors to image's (the TJCoding "ruggedised"
    // fix from xiao-ma.md §9). Without this, sign ambiguity in the
    // eigensolver can flip channels in the final transform.
    for (let col = 0; col < 3; col++) {
        let dot = 0;
        for (let r = 0; r < 3; r++) dot += eigT.vectors[r][col] * eigS.vectors[r][col];
        if (dot < 0) for (let r = 0; r < 3; r++) eigS.vectors[r][col] = -eigS.vectors[r][col];
    }

    // Per-axis scale: √λ_s / √λ_t. Clamp eigenvalues at 0 (numerical) and
    // add eps to the divisor for degenerate-axis stability.
    const EPS = 1e-8;
    const scale = [
        Math.sqrt(Math.max(eigS.values[0], 0)) / Math.sqrt(Math.max(eigT.values[0], EPS)),
        Math.sqrt(Math.max(eigS.values[1], 0)) / Math.sqrt(Math.max(eigT.values[1], EPS)),
        Math.sqrt(Math.max(eigS.values[2], 0)) / Math.sqrt(Math.max(eigT.values[2], EPS)),
    ];

    // A = R_s · diag(scale) · R_tᵀ. R_s, R_t store eigenvectors as columns.
    // Build in two steps to keep the matrix algebra readable:
    //   tmp[i][k] = R_s[i][k] · scale[k]   (scale columns of R_s)
    //   A[i][j]   = Σ_k tmp[i][k] · R_tᵀ[k][j] = Σ_k tmp[i][k] · R_t[j][k]
    const Rs = eigS.vectors, Rt = eigT.vectors;
    const tmp = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
        for (let k = 0; k < 3; k++)
            tmp[i][k] = Rs[i][k] * scale[k];
    const A = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            let s = 0;
            for (let k = 0; k < 3; k++) s += tmp[i][k] * Rt[j][k];
            A[i][j] = s;
        }

    // Apply  out = A · (pixel − μ_t) + μ_s  per the reference's applyAffineRGB.
    // Inlining the (pixel − μ_t) offset into A's column sums + adding μ_s
    // would be slightly faster but the explicit form makes the algorithm
    // structure obvious in a profiler trace.
    for (let i = 0; i < pixels.length; i += 4) {
        const dr = pixels[i]     - mIR;
        const dg = pixels[i + 1] - mIG;
        const db = pixels[i + 2] - mIB;
        pixels[i]     = A[0][0]*dr + A[0][1]*dg + A[0][2]*db + mPR;
        pixels[i + 1] = A[1][0]*dr + A[1][1]*dg + A[1][2]*db + mPG;
        pixels[i + 2] = A[2][0]*dr + A[2][1]*dg + A[2][2]*db + mPB;
    }
};
