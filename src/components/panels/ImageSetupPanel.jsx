import { RotateCcw } from 'lucide-react';
import { clamp } from '../../lib/math';
import { PanelSection, NumberInput, RangeSlider } from '../ui';

// Source-image knobs: output dimensions and (for animation sources) the
// playback framerate. Color-space and palette-mapping options live in
// ColorsPanel — they're conceptually separate enough to warrant their own
// header in the side panel.
export const ImageSetupPanel = ({ settings, updateSetting, imageLoaded, onResetOriginalSize, isAnimation }) => {
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
                <div className="flex items-center justify-between">
                    <span className="field-label">Video Framerate</span>
                    {/* w-32 here keeps the row's right edge aligned with every other harmonized
                        control. Orig. button takes its natural width when present; input flex-1
                        fills the remainder so the combined group is always exactly 32 units wide. */}
                    <div className="flex items-center gap-1 w-32">
                        {settings.originalFps && (
                            <button onClick={() => updateSetting('videoFps', settings.originalFps)} className={`field-label px-1.5 py-1 transition-colors ${settings.videoFps === settings.originalFps ? 'bg-neutral-200 text-black dark:bg-neutral-800 dark:text-white' : 'hover:text-black dark:hover:text-white'}`} title="Reset to Original FPS">Orig.</button>
                        )}
                        <input type="number" min={1} max={120} value={settings.videoFps || 30} onChange={(e) => updateSetting('videoFps', clamp(Number(e.target.value), 1, 120))} className="field-input flex-1 min-w-0" />
                    </div>
                </div>
            )}
        </PanelSection>
    );
};
