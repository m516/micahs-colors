import { cls, segmentButton, PanelSection, RangeSlider, Select } from '../ui';

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
        </PanelSection>
    );
};
