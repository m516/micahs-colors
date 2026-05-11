// Citation catalog for the published algorithms / color spaces / techniques
// exposed in the UI. Keyed by short ID. Each entry has:
//   name        — short display name as it appears in the UI option
//   title       — paper title or canonical name
//   description — verb-phrase explaining what the app does with it
//   citation    — full reference string (author, year, venue, DOI/ISBN when known)
//   formal      — 'peer-reviewed' | 'standard' | 'technical-report' | 'blog' | 'folklore'
//                 ('folklore' covers items with no formal publication where the
//                 attribution traces back to forum posts or shipped binaries)
//
// Corrections from references.md have been applied (Stage 1 + Stage 2 + DOI/ISBN
// additions). Items #14 (Atkinson), #15 (Sierra), #19 (Riemersma), and #20
// (Hilbert) had material errors and are now rewritten; items #1 (sRGB), #3
// (Oklab), #4 (CIELAB), and #10 (Bayer) had partial errors that are tightened.
export const REFERENCES = {

    // === Color spaces ===
    'srgb': {
        name: 'sRGB',
        title: 'Default RGB Colour Space — sRGB',
        description: 'Compute color distances in 8-bit sRGB with the standard piecewise gamma curve.',
        citation: 'IEC 61966-2-1:1999, "Multimedia systems and equipment — Colour measurement and management — Part 2-1: Colour management — Default RGB colour space — sRGB," International Electrotechnical Commission, Geneva, 1999, ISBN 2-8318-4989-6 (amended by A1:2003).',
        formal: 'standard',
    },
    'linear-rgb': {
        name: 'Linear RGB',
        title: 'Linearized (gamma-decoded) sRGB',
        description: 'Compute color distances in physically linear RGB by undoing the sRGB transfer function before processing.',
        citation: 'IEC 61966-2-1:1999, transfer functions in clause 5; inverse documented in the W3C technical report "A Standard Default Color Space for the Internet — sRGB," Stokes, Anderson, Chandrasekar, Motta, 1996.',
        formal: 'standard',
    },
    'oklab': {
        name: 'Oklab',
        title: 'A perceptual color space for image processing',
        description: 'Compute color distances in Oklab, a perceptually-uniform space whose two-stage LMS-like transform and non-linearity exponents are fit to IPT-style hue datasets and tuned to approximate CIECAM16-UCS predictions.',
        citation: 'Ottosson, B. "A perceptual color space for image processing," personal blog (bottosson.github.io/posts/oklab/), 23 December 2020.',
        formal: 'blog',
    },
    'cielab': {
        name: 'CIE L*a*b*',
        title: 'CIE 1976 L*a*b* color space',
        description: 'Compute color distances in CIELAB, the industry-standard perceptually-uniform space derived from CIE XYZ.',
        citation: 'CIE Publication 15:2004, "Colorimetry," Commission Internationale de l\'Éclairage, Vienna, 3rd ed., 2004, ISBN 978-3-901906-33-6. Originally adopted in CIE Publication 15, Supplement 2 ("Recommendations on Uniform Color Spaces, Color-Difference Equations, Psychometric Color Terms"), 1978 (ratified 1976).',
        formal: 'standard',
    },
    'yuv': {
        name: 'YUV',
        title: 'BT.601 luma + chroma encoding',
        description: 'Compute color distances in BT.601 luma/chroma coordinates as used in analog television and most consumer video codecs.',
        citation: 'ITU-R Recommendation BT.601-7, "Studio encoding parameters of digital television for standard 4:3 and wide-screen 16:9 aspect ratios," International Telecommunication Union, March 2011.',
        formal: 'standard',
    },

    // === Color transfer ===
    'reinhard-2001': {
        name: 'Reinhard 2001',
        title: 'Color Transfer between Images',
        description: 'Transfer colors by matching per-channel mean and standard deviation in the Ruderman lαβ opponent space.',
        citation: 'Reinhard, E., Ashikhmin, M., Gooch, B., Shirley, P. "Color Transfer between Images," IEEE Computer Graphics and Applications 21(5):34–41, September–October 2001. DOI: 10.1109/38.946629.',
        formal: 'peer-reviewed',
    },
    'ruderman-1998': {
        name: 'Ruderman lαβ',
        title: 'Statistics of cone responses to natural images',
        description: 'Underlies Reinhard 2001: derives the decorrelated lαβ basis via PCA on log-LMS responses of natural-image ensembles.',
        citation: 'Ruderman, D. L., Cronin, T. W., Chiao, C.-C. "Statistics of cone responses to natural images: implications for visual coding," Journal of the Optical Society of America A 15(8):2036–2045, August 1998. DOI: 10.1364/JOSAA.15.002036.',
        formal: 'peer-reviewed',
    },
    'xiao-ma-2006': {
        name: 'Xiao–Ma 2006',
        title: 'Color Transfer in Correlated Color Space',
        description: 'Transfer colors by matching the full 3×3 covariance of palette and image clouds in native RGB via eigendecomposition.',
        citation: 'Xiao, X., Ma, L. "Color Transfer in Correlated Color Space," VRCIA \'06: Proceedings of the 2006 ACM International Conference on Virtual Reality Continuum and Its Applications, Hong Kong, 14–17 June 2006, pp. 305–309. DOI: 10.1145/1128923.1128974.',
        formal: 'peer-reviewed',
    },

    // === Color matching ===
    'frank-wolfe-1956': {
        name: 'Frank–Wolfe',
        title: 'An algorithm for quadratic programming',
        description: 'Match palette colors by iteratively moving the candidate toward the highest-weight palette vertex of a convex-combination decomposition.',
        citation: 'Frank, M., Wolfe, P. "An algorithm for quadratic programming," Naval Research Logistics Quarterly 3(1–2):95–110, March 1956. DOI: 10.1002/nav.3800030109.',
        formal: 'peer-reviewed',
    },

    // === Dither methods ===
    'bayer-1973': {
        name: 'Bayer',
        title: 'An optimum method for two-level rendition of continuous-tone pictures',
        description: 'Dither pixels by comparing them against a recursively-tiled ordered threshold matrix that maximally disperses error spatially.',
        citation: 'Bayer, B. E. "An optimum method for two-level rendition of continuous-tone pictures," IEEE International Conference on Communications, Conference Record, vol. 9, no. 1, paper 26, pp. 26-11–26-15, June 1973.',
        formal: 'peer-reviewed',
    },
    'holladay-1980': {
        name: 'Clustered-Dot Halftone',
        title: 'An optimum algorithm for halftone generation',
        description: 'Dither pixels by comparing them against a clustered-dot ordered screen, the canonical halftoning approach for offset printing.',
        citation: 'Holladay, T. M. "An optimum algorithm for halftone generation for displays and hard copies," Proceedings of the Society for Information Display 21(2):185–192, 1980.',
        formal: 'peer-reviewed',
    },
    'ulichney-1993': {
        name: 'Void-and-Cluster',
        title: 'The void-and-cluster method for dither array generation',
        description: 'Dither pixels using a precomputed blue-noise mask generated by iteratively filling the largest void and removing the densest cluster.',
        citation: 'Ulichney, R. A. "The void-and-cluster method for dither array generation," Proc. SPIE 1913 (Human Vision, Visual Processing, and Digital Display IV), pp. 332–343, 8 September 1993. DOI: 10.1117/12.152707.',
        formal: 'peer-reviewed',
    },
    'floyd-steinberg-1976': {
        name: 'Floyd–Steinberg',
        title: 'An adaptive algorithm for spatial grey scale',
        description: 'Dither pixels by quantizing left-to-right and diffusing the residual into four neighbors with weights 7/16, 3/16, 5/16, 1/16.',
        citation: 'Floyd, R. W., Steinberg, L. "An adaptive algorithm for spatial grey scale," Proceedings of the Society for Information Display 17(2):75–77, 1976 (originally presented at the SID 75 International Symposium, Digest of Technical Papers, pp. 36–37, 1975).',
        formal: 'peer-reviewed',
    },
    'atkinson-1986': {
        name: 'Atkinson',
        title: 'Atkinson dithering',
        description: 'Dither pixels by diffusing 6/8 of the residual into six neighbors (1/8 each) — trades dynamic range for sharper edges; originated in MacPaint / HyperScan.',
        citation: 'Atkinson, B. (Apple Computer), c. 1983–1984. First shipped in MacPaint 1.0 (Apple, January 1984) and Apple HyperScan; no formal publication. Coefficient matrix subsequently disclosed by Atkinson directly to John Balestrieri in January 2003 and popularized via HyperDither (Tinrocket, 2008).',
        formal: 'folklore',
    },
    'sierra-1989': {
        name: 'Sierra',
        title: 'Sierra error-diffusion filters',
        description: 'Dither pixels with a 3-row error-diffusion stencil that distributes more weight to far-away neighbors than Floyd–Steinberg.',
        citation: 'Sierra, F. "Filter Lite" and "Two-Row" error-diffusion filters, distributed via CompuServe forum posts (likely GRAPHICS / DTPFORUM), c. 1989–1990. No peer-reviewed publication; cataloged in Lee Daniel Crocker\'s halftone FAQ and in ImageMagick documentation.',
        formal: 'folklore',
    },
    'stucki-1981': {
        name: 'Stucki',
        title: 'MECCA — Multiple-Error Correcting Computation Algorithm',
        description: 'Dither pixels with a wide 12-coefficient error-diffusion stencil normalized to 42 for clean integer arithmetic.',
        citation: 'Stucki, P. "MECCA — A multiple-error correcting computation algorithm for bilevel image hardcopy reproduction," IBM Research Report RZ1060, IBM Zurich Research Laboratory, 1981.',
        formal: 'technical-report',
    },
    'burkes-1988': {
        name: 'Burkes',
        title: 'Burkes error-diffusion filter',
        description: 'Dither pixels with a 2-row Stucki-derived stencil whose coefficients sum to 32, simpler than the parent filter.',
        citation: 'Burkes, D. "Presentation of the Burkes error filter for use in preparing continuous-tone images for presentation on bilevel devices," CompuServe Information Service, LIB 15 (Specialized Imaging) forum post, 1988. No peer-reviewed publication; cataloged in Lee Daniel Crocker\'s halftone FAQ and in ImageMagick / PIL documentation.',
        formal: 'folklore',
    },
    'ostromoukhov-2001': {
        name: 'Ostromoukhov',
        title: 'A Simple and Efficient Error-Diffusion Algorithm',
        description: 'Dither pixels using a variable error-diffusion stencil whose three coefficients are looked up per input intensity from a 256-entry tuned table.',
        citation: 'Ostromoukhov, V. "A simple and efficient error-diffusion algorithm," Proceedings of ACM SIGGRAPH 2001 (Computer Graphics Proceedings, Annual Conference Series), pp. 567–572, 2001. DOI: 10.1145/383259.383326.',
        formal: 'peer-reviewed',
    },
    'riemersma-1998': {
        name: 'Riemersma',
        title: 'A Balanced Dithering Technique',
        description: 'Dither pixels along a Hilbert space-filling curve using an exponentially-decaying memory of recent residuals — kills the directional artifacts of raster-scan diffusion.',
        citation: 'Riemersma, T. "A Balanced Dithering Technique," C/C++ Users Journal 16(12), December 1998 (later reprinted online by Dr. Dobb\'s). Page range to be verified against the physical CUJ issue.',
        formal: 'peer-reviewed',
    },
    'hilbert-1891': {
        name: 'Hilbert curve',
        title: 'On the continuous mapping of a line onto a surface element',
        description: 'Underlies Riemersma 1998: a continuous space-filling curve that visits 2D pixels in an order with strong local coherence.',
        citation: 'Hilbert, D. "Ueber die stetige Abbildung einer Linie auf ein Flächenstück," Mathematische Annalen 38:459–460, 1891. (EuDML: eudml.org/doc/157555)',
        formal: 'peer-reviewed',
    },
    'knoll-pattern': {
        name: 'Knoll Pattern',
        title: 'Pattern Dither (Adobe Photoshop)',
        description: 'Dither pixels by selecting per-cell the linear combination of N palette colors that best matches the source — Adobe Photoshop\'s built-in Pattern dither.',
        citation: 'Knoll, T. "Pattern Dither" indexed-color option, Adobe Photoshop 2.5 (1992) or possibly earlier; no formal publication by Adobe. Algorithm reverse-engineered and described by Joel Yliluoma in "Arbitrary-Palette Positional Dithering Algorithm" (bisqwit.iki.fi/story/howto/dither/jy/), 2011.',
        formal: 'folklore',
    },
    'shepard-1968': {
        name: 'Shepard / IDW',
        title: 'A two-dimensional interpolation function for irregularly-spaced data',
        description: 'Dither pixels by inverse-distance-weighted blending of the N nearest palette colors — basis of the IDW Candidates and N-Convex modes.',
        citation: 'Shepard, D. "A two-dimensional interpolation function for irregularly-spaced data," Proceedings of the 1968 23rd ACM National Conference (ACM \'68), pp. 517–524, 1968. DOI: 10.1145/800186.810616.',
        formal: 'peer-reviewed',
    },
    'beer-lambert': {
        name: 'Beer–Lambert',
        title: 'Beer–Lambert (–Bouguer) absorption law',
        description: 'Mix palette colors as transmissive pigments via the additive log-transmittance law that models light passing through colored layers.',
        citation: 'Beer, A. "Bestimmung der Absorption des rothen Lichts in farbigen Flüssigkeiten," Annalen der Physik und Chemie 162 (series 2, vol. 86):78–88, 1852. DOI: 10.1002/andp.18521620505. Predecessors: Lambert, J. H. "Photometria, sive de mensura et gradibus luminis, colorum et umbrae," Eberhardt Klett, Augsburg, 1760; Bouguer, P. "Essai d\'optique sur la gradation de la lumière," Paris, 1729.',
        formal: 'peer-reviewed',
    },
    'mixbox-2021': {
        name: 'Mixbox',
        title: 'Practical Pigment Mixing for Digital Painting',
        description: 'Mix palette colors as physical pigments via a learned latent space trained on Kubelka–Munk responses of real paints.',
        citation: 'Sochorová, Š., Jamriška, O. "Practical Pigment Mixing for Digital Painting," ACM Transactions on Graphics (Proceedings of SIGGRAPH Asia 2021) 40(6):234:1–234:11, December 2021. DOI: 10.1145/3478513.3480549.',
        formal: 'peer-reviewed',
    },
    'heckbert-1982': {
        name: 'Median Cut',
        title: 'Color image quantization for frame buffer display',
        description: 'Quantize an image to ≤256 colors for GIF export by recursively splitting the color cloud\'s bounding box at the longest dimension\'s median.',
        citation: 'Heckbert, P. S. "Color image quantization for frame buffer display," Computer Graphics (SIGGRAPH \'82 Proceedings) 16(3):297–307, July 1982. DOI: 10.1145/965145.801294. Originally in Heckbert\'s B.S. thesis, MIT Architecture Machine Group, 1980.',
        formal: 'peer-reviewed',
    },
};

// Map a settings object to the list of references whose algorithms / spaces
// are actually engaged. Order: color space → color transfer → matching →
// dither → ancillary (e.g. Hilbert curve under Riemersma, median-cut under
// GIF-relevant mixing modes). Output preserves insertion order and dedupes.
export const activeReferences = (settings) => {
    const ids = [];
    const push = (id) => { if (id && !ids.includes(id)) ids.push(id); };

    // Color space — applies to dither distance/projection calculations.
    const csMap = { srgb: 'srgb', linear: 'linear-rgb', oklab: 'oklab', lab: 'cielab', yuv: 'yuv' };
    if (settings.ditherSubMethod !== 'none') push(csMap[settings.colorSpace]);

    // Color transfer — only the published algorithms have citations; "box" is ad-hoc.
    if (settings.colorTransfer === 'reinhard') { push('reinhard-2001'); push('ruderman-1998'); }
    if (settings.colorTransfer === 'xiao-ma')  push('xiao-ma-2006');

    // Color matching — Frank-Wolfe is only consulted by the modes that show the toggle.
    const showsMatch = settings.ditherSubMethod !== 'none'
        && settings.ditherCategory !== 'pattern'
        && settings.ditherCategory !== 'geometric'
        && settings.ditherSubMethod !== 'linear-projection'
        && settings.ditherSubMethod !== 'fw-dither'
        && settings.ditherSubMethod !== 'paper-beer-lambert'
        && settings.ditherSubMethod !== 'paper-mixbox';
    if (showsMatch && settings.matchMethod === 'fw') push('frank-wolfe-1956');

    // Dither method.
    const ditherMap = {
        'bayer':              'bayer-1973',
        'halftone':           'holladay-1980',
        'blue-noise':         'ulichney-1993',
        'floyd':              'floyd-steinberg-1976',
        'atkinson':           'atkinson-1986',
        'sierra':             'sierra-1989',
        'sierra-lite':        'sierra-1989',
        'stucki':             'stucki-1981',
        'burkes':             'burkes-1988',
        'ostromoukhov':       'ostromoukhov-2001',
        'riemersma':          'riemersma-1998',
        'knoll':              'knoll-pattern',
        'n-closest':          'shepard-1968',
        'n-convex':           'shepard-1968',
        'fw-dither':          'frank-wolfe-1956',
        'paper-beer-lambert': 'beer-lambert',
        'paper-mixbox':       'mixbox-2021',
    };
    push(ditherMap[settings.ditherSubMethod]);

    // Riemersma is built on the Hilbert space-filling curve.
    if (settings.ditherSubMethod === 'riemersma') push('hilbert-1891');

    return ids.map(id => ({ id, ...REFERENCES[id] })).filter(r => r.name);
};
