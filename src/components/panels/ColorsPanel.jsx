import { cls, segmentButton, PanelSection, RangeSlider, Select } from '../ui';
import { EXTRACTOR_LIST } from '../../lib/palette-extractors';

// Group the Palette Picker dropdown by speedTier so users can pick "fast and
// cheap" vs "slow and accurate" before worrying about family. Tier ordering is
// fastest → slowest. Within a tier we preserve the registry's order (which
// puts 'hull', the default, first under Realtime).
const SPEED_TIER_ORDER = ['realtime', 'interactive', 'slow', 'prohibitive'];
const SPEED_TIER_LABEL = {
    realtime:    'Realtime',
    interactive: 'Interactive',
    slow:        'Slow',
    prohibitive: 'Prohibitive',
};
const PALETTE_EXTRACTOR_OPTGROUPS = (() => {
    const tiers = {};
    for (const a of EXTRACTOR_LIST) {
        const tier = a.speedTier || 'realtime';
        (tiers[tier] ||= []).push({ value: a.id, label: a.name, title: `${a.name} (${a.author}, ${a.year}) — ${a.blurb}` });
    }
    const ordered = {};
    for (const tier of SPEED_TIER_ORDER) {
        if (tiers[tier]) ordered[SPEED_TIER_LABEL[tier]] = tiers[tier];
    }
    return ordered;
})();

// Hover tooltip on the label — describes what the option controls in general.
// Per-algorithm detail is in EXTRACTOR_LIST[].blurb (shown via the option's own
// title attribute when the menu is open).
const PALETTE_EXTRACTOR_HELP =
    "How the palette is derived from the source image. Options are grouped by " +
    "speed: Realtime algorithms run instantly even at large K; Interactive ones " +
    "may pause briefly; Slow and Prohibitive use heavier optimization that pays " +
    "off most at small K. Default is Micah's. " +
    "Hover any option for the algorithm's details.";

const CONTRAST_ENHANCEMENT_HELP =
    "Reserve palette slots for high-contrast 'anchor' colors before the main " +
    "picker runs, so the resulting palette covers the image's extremes. " +
    "Off: skip. Ends: darkest + brightest pixel (by L in the selected space). " +
    "1×8: 8 corner pixels of the [0,1]³ cube in the selected space. " +
    "N×8: 8 corners in every supported color space — broader spread.";

// Tooltip on the Color Matching label — kept here so the wording stays
// alongside the option labels it describes. Frank-Wolfe is the slower
// default because it gives perceptibly better results for small palettes.
const COLOR_MATCHING_HELP =
    "How pixels are matched to palette colors. " +
    "Fast = nearest neighbor by Euclidean distance in the selected color space. " +
    "Slow = Frank-Wolfe optimization picks the palette color with the highest weight " +
    "when the pixel is expressed as a convex combination of palette entries — slower, " +
    "but a closer perceptual match when the pixel isn't already in the palette.";

// Help text for the Color Transfer toggle. Buttons carry their own per-mode
// tooltips with the algorithmic detail; this is the overview.
const COLOR_TRANSFER_HELP =
    "Pre-dither pass that pulls the image's colors into the palette's range. " +
    "Box preserves darkness ordering but ignores cross-channel correlation. " +
    "Reinhard and Xiao-Ma match the cloud's mean (and Xiao-Ma its full covariance) to the palette — " +
    "perceptually accurate but can shift dark pixels brighter if the palette mean is brighter than the image's.";

// Pre-dither color knobs: which space to compute distances/projections in,
// whether to remap the image gamut into the palette's bounds, the matching
// strategy when applicable, and per-channel luma weights for RGB spaces.
// Conditional rows (Color Matching, Luma Weights) only render when the
// current dither method actually consumes them.
export const ColorsPanel = ({ settings, updateSetting }) => {
    const showMatchMethod = settings.ditherSubMethod !== 'none'
        && settings.ditherCategory !== 'pattern'
        && settings.ditherCategory !== 'geometric'
        && settings.ditherSubMethod !== 'linear-projection'
        && settings.ditherSubMethod !== 'fw-dither'
        && settings.ditherSubMethod !== 'paper-beer-lambert'
        && settings.ditherSubMethod !== 'paper-mixbox';
    const showLumaWeights = settings.colorSpace === 'srgb' || settings.colorSpace === 'linear';
    return (
        <PanelSection title="Colors">
            <div className="flex items-center justify-between">
                <span className="field-label">Color Space</span>
                {/* w-32 ≈ "Orig." button (~52px) + gap-1.5 (6px) + w-16 input (64px) ≈ 122px ≈ 8rem. Matches the
                    Video Framerate row's right-hand controls so the two rows line up. */}
                <Select className="w-32" value={settings.colorSpace} onChange={(e) => updateSetting('colorSpace', e.target.value)} optgroups={{
                    "Standard": [{value: 'srgb', label: 'sRGB'}, {value: 'linear', label: 'Linear RGB'}],
                    "Perceptual": [{value: 'oklab', label: 'Oklab'}, {value: 'lab', label: 'CIE Lab'}],
                    "Broadcast": [{value: 'yuv', label: 'YUV'}]
                }} />
            </div>
            <div className="flex items-center justify-between">
                <span className="field-label cursor-help" title={COLOR_TRANSFER_HELP}>Color Transfer</span>
                <div className={`${cls.segmentGroup} w-32`}>
                    {[
                        {value: 'none',     label: 'None', title: 'No color transfer — image pixels are dithered as-is.'},
                        {value: 'box',      label: 'B',    title: 'Box — translate + per-channel scale so the image\'s RGB range maps onto the palette\'s. Preserves darkness ordering (darkest pixel → darkest palette color).'},
                        {value: 'reinhard', label: 'R',    title: 'Reinhard 2001 — per-channel mean/std match in Ruderman lαβ (log-LMS opponent space). Classic. Best for natural-image sources.'},
                        {value: 'xiao-ma',  label: 'X',    title: 'Xiao-Ma 2006 — full RGB covariance match via SVD. Generalizes Reinhard with channel correlation; rotates the cloud as well as stretching it.'},
                    ].map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => updateSetting('colorTransfer', opt.value)}
                            className={segmentButton((settings.colorTransfer || 'none') === opt.value)}
                            title={opt.title}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            {showMatchMethod && (
                <div className="flex items-center justify-between">
                    <span className="field-label cursor-help" title={COLOR_MATCHING_HELP}>Color Matching</span>
                    <div className={`${cls.segmentGroup} w-32`}>
                        {[
                            {value: 'euclidean', label: 'Fast'},
                            {value: 'fw',        label: 'Slow'},
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => updateSetting('matchMethod', opt.value)}
                                className={segmentButton((settings.matchMethod || 'fw') === opt.value)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {showLumaWeights && (
                <div className="p-2 border space-y-1 bg-neutral-50 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700">
                    <span className="field-label">Luma Weights</span>
                    {['r', 'g', 'b'].map(c => (
                        <div key={c} className="flex items-center gap-2">
                            <span className="w-3 field-label">{c}</span>
                            <RangeSlider min={0} max={1} step={0.01} value={settings.manualWeights[c]} onChange={(e) => updateSetting('manualWeights', { ...settings.manualWeights, [c]: Number(e.target.value) })} />
                        </div>
                    ))}
                </div>
            )}
            {/* Palette-derivation knobs sit at the bottom of the Colors section so
                they read as a bridge into the Palette panel below — the picker
                chooses HOW the swatches are sourced and the contrast switch
                reserves slots before that picker runs. */}
            <div className="flex items-center justify-between">
                <span className="field-label cursor-help" title={PALETTE_EXTRACTOR_HELP}>Palette Picker</span>
                <Select className="w-32" value={settings.paletteExtractor || 'hull'} onChange={(e) => updateSetting('paletteExtractor', e.target.value)} optgroups={PALETTE_EXTRACTOR_OPTGROUPS} />
            </div>
            <div className="flex items-center justify-between">
                <span className="field-label cursor-help" title={CONTRAST_ENHANCEMENT_HELP}>Contrast 🡅</span>
                <div className={`${cls.segmentGroup} w-32`}>
                    {[
                        {value: 'none',            label: 'Off',  title: 'No contrast enhancement — the palette picker runs unmodified.'},
                        {value: 'extremes',        label: 'Ends', title: 'Brightest + darkest — reserves the two pixels with min/max luminance in the selected color space as palette seeds.'},
                        {value: 'single-corners',  label: '1×8',  title: 'Single-space corners — 8 pixels (one per corner of the [0,1]³ cube) in the selected color space, normalized against the image\'s bounds.'},
                        {value: 'every-corners',   label: 'N×8',  title: 'Every-space corners — 8 corners in each of sRGB, Linear, Oklab, CIE Lab, and YUV; deduped. Up to 40 seeds spread under every implemented perceptual metric.'},
                    ].map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => updateSetting('contrastEnhancement', opt.value)}
                            className={segmentButton((settings.contrastEnhancement || 'none') === opt.value)}
                            title={opt.title}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </PanelSection>
    );
};
