import { WrapText, Dices } from 'lucide-react';
import { cls, segmentButton, PanelSection, Select, IconButton, RangeSlider } from '../ui';

const DITHER_CATEGORIES = {
    'none': 'none',
    'bayer': 'pattern', 'halftone': 'pattern', 'blue-noise': 'pattern',
    'floyd': 'flow', 'atkinson': 'flow', 'sierra': 'flow', 'sierra-lite': 'flow', 'stucki': 'flow', 'burkes': 'flow', 'ostromoukhov': 'flow', 'riemersma': 'flow',
    'knoll': 'geometric', 'n-closest': 'geometric', 'n-convex': 'geometric', 'fw-dither': 'geometric',
    'best-match': 'analytical', 'linear-projection': 'analytical', 'paper-beer-lambert': 'analytical', 'paper-mixbox': 'analytical'
};

export const DitheringPanel = ({ settings, updateSetting, paletteData, onPaletteAction }) => {
    const handleMethodChange = (e) => { const method = e.target.value; updateSetting('ditherSubMethod', method); updateSetting('ditherCategory', DITHER_CATEGORIES[method]); };
    return (
        <PanelSection title="Mixing / Dithering">
            <div className="flex gap-2">
                <Select value={settings.ditherSubMethod} onChange={handleMethodChange} optgroups={{
                    "No Dither": [ {value: 'none', label: 'None (passthrough)'}, {value: 'best-match', label: 'Best Match'}, {value: 'linear-projection', label: 'Linear Projection'}, {value: 'paper-beer-lambert', label: 'Paper (Beer-Lambert)'}, {value: 'paper-mixbox', label: 'Paper (Mixbox)'} ],
                    "Ordered": [ {value: 'bayer', label: 'Bayer (Dispersed)'}, {value: 'halftone', label: 'Halftone (Clustered)'}, {value: 'blue-noise', label: 'Blue Noise'} ],
                    "Diffusion": [ {value: 'floyd', label: 'Floyd-Steinberg'}, {value: 'atkinson', label: 'Atkinson'}, {value: 'sierra', label: 'Sierra (3-row)'}, {value: 'sierra-lite', label: 'Sierra Lite'}, {value: 'stucki', label: 'Stucki'}, {value: 'burkes', label: 'Burkes'}, {value: 'ostromoukhov', label: 'Ostromoukhov'}, {value: 'riemersma', label: 'Riemersma'} ],
                    "Geometric": [ {value: 'knoll', label: 'Knoll Pattern (Adobe)'}, {value: 'n-closest', label: 'IDW Candidates'}, {value: 'n-convex', label: 'N-Convex'}, {value: 'fw-dither', label: 'Frank-Wolfe Threshold'} ]
                }} />
                {settings.ditherCategory === 'flow' && settings.ditherSubMethod !== 'riemersma' && <IconButton icon={WrapText} onClick={() => updateSetting('serpentine', !settings.serpentine)} title="Serpentine Scanning" className={`border ${settings.serpentine ? 'bg-neutral-200 border-neutral-400 dark:bg-neutral-800' : 'border-neutral-300 dark:border-neutral-700'}`} />}
                {settings.ditherCategory === 'pattern' && settings.ditherSubMethod === 'halftone' && paletteData.displayed.some(c => c.locked) && <IconButton icon={Dices} onClick={() => onPaletteAction.randomizeOffsets()} title="Randomize All Offsets" className="border border-neutral-300 dark:border-neutral-700" />}
            </div>
            {settings.ditherCategory === 'flow' && settings.ditherSubMethod === 'riemersma' && <>
                <div><div className="flex justify-between slider-label mb-1.5"><span>CURVE HISTORY (Q)</span><span>{settings.riemersmaHistory}</span></div><RangeSlider min={4} max={64} step={4} value={settings.riemersmaHistory} onChange={(e) => updateSetting('riemersmaHistory', Number(e.target.value))} /></div>
                <div><div className="flex justify-between slider-label mb-1.5"><span>WEIGHT RATIO (r)</span><span>{settings.riemersmaRatio || 16}</span></div><RangeSlider min={2} max={64} step={2} value={settings.riemersmaRatio || 16} onChange={(e) => updateSetting('riemersmaRatio', Number(e.target.value))} /></div>
            </>}
            {settings.ditherCategory === 'pattern' && settings.ditherSubMethod !== 'blue-noise' && <div className={cls.segmentGroup}>{[2, 4, 8, 16, 32].map(s => (<button key={s} onClick={() => updateSetting('bayerSize', s)} className={segmentButton(settings.bayerSize === s)}>{s}x</button>))}</div>}
            {settings.ditherCategory === 'geometric' && settings.ditherSubMethod !== 'fw-dither' && <div><div className="flex justify-between slider-label mb-1.5"><span>CANDIDATES (N)</span><span>{settings.nCandidates}</span></div><RangeSlider min={2} max={16} step={1} value={settings.nCandidates} onChange={(e) => updateSetting('nCandidates', Number(e.target.value))} /></div>}
            {settings.ditherCategory === 'geometric' && (settings.ditherSubMethod === 'n-closest' || settings.ditherSubMethod === 'n-convex') && <div><div className="flex justify-between slider-label mb-1.5"><span>DISTANCE EXPONENT (s)</span><span>{settings.distanceExponent}</span></div><RangeSlider min={0.5} max={5} step={0.5} value={settings.distanceExponent} onChange={(e) => updateSetting('distanceExponent', Number(e.target.value))} /></div>}
            {settings.ditherCategory !== 'analytical' && settings.ditherCategory !== 'none' && <div className="pt-1"><div className="flex justify-between slider-label mb-1.5"><span>INTENSITY / SPREAD</span><span>{Math.round(settings.dithering * 100)}%</span></div><RangeSlider min={0} max={1} step={0.05} value={settings.dithering} onChange={(e) => updateSetting('dithering', Number(e.target.value))} /></div>}
        </PanelSection>
    );
};
