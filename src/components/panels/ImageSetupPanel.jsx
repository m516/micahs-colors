import { RotateCcw } from 'lucide-react';
import { clamp } from '../../lib/math';
import { PanelSection, NumberInput, RangeSlider, Select } from '../ui';

export const ImageSetupPanel = ({ settings, updateSetting, imageLoaded, onResetOriginalSize, isAnimation }) => {
    const showMatchMethod = settings.ditherCategory !== 'pattern' && settings.ditherCategory !== 'geometric' && settings.ditherSubMethod !== 'linear-projection' && settings.ditherSubMethod !== 'fw-dither' && settings.ditherSubMethod !== 'paper-beer-lambert' && settings.ditherSubMethod !== 'paper-mixbox';
    return (
        <PanelSection title="Image Setup" action={
            imageLoaded ? <button onClick={onResetOriginalSize} className="field-label hover:text-neutral-900 dark:hover:text-neutral-200 flex items-center gap-1"><RotateCcw size={10} /> Original</button> : null
        }>
            <div className="grid grid-cols-2 gap-2">
                <NumberInput label="W" value={settings.width} onChange={(e) => { const w = clamp(Number(e.target.value), 32, 5000); updateSetting('width', w); updateSetting('height', Math.round(w / settings.aspectRatio)); }} />
                <NumberInput label="H" value={settings.height} onChange={(e) => { const h = clamp(Number(e.target.value), 32, 5000); updateSetting('height', h); updateSetting('width', Math.round(h * settings.aspectRatio)); }} />
            </div>
            <RangeSlider min={32} max={640} step={4} value={Math.min(settings.width, 640)} onChange={(e) => { const w = clamp(Number(e.target.value), 32, 5000); updateSetting('width', w); updateSetting('height', Math.round(w / settings.aspectRatio)); }} />
            {isAnimation && (
                <div className="flex items-center justify-between pt-1">
                    <span className="field-label">Video Framerate</span>
                    <div className="flex items-center gap-1.5">
                        {settings.originalFps && (
                            <button onClick={() => updateSetting('videoFps', settings.originalFps)} className={`field-label px-1.5 py-1 transition-colors rounded-sm ${settings.videoFps === settings.originalFps ? 'bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white' : 'hover:text-black dark:hover:text-white'}`} title="Reset to Original FPS">Orig.</button>
                        )}
                        <input type="number" min={1} max={120} value={settings.videoFps || 30} onChange={(e) => updateSetting('videoFps', clamp(Number(e.target.value), 1, 120))} className="field-input w-16" />
                    </div>
                </div>
            )}
            <Select value={settings.colorSpace} onChange={(e) => updateSetting('colorSpace', e.target.value)} optgroups={{
                "Standard": [{value: 'srgb', label: 'sRGB'}, {value: 'linear', label: 'Linear RGB'}],
                "Perceptual": [{value: 'oklab', label: 'Oklab'}, {value: 'lab', label: 'CIE Lab'}],
                "Broadcast": [{value: 'yuv', label: 'YUV'}]
            }} />
            {showMatchMethod && (
                <Select value={settings.matchMethod || 'euclidean'} onChange={(e) => updateSetting('matchMethod', e.target.value)} optgroups={{
                    "Color Matching": [{value: 'euclidean', label: 'Fast (Euclidean Minimum)'}, {value: 'fw', label: 'Slow (FW Highest Weight)'}]
                }} />
            )}
            {(settings.colorSpace === 'srgb' || settings.colorSpace === 'linear') && (
                <div className="p-3 border space-y-2 bg-neutral-50 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700">
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
