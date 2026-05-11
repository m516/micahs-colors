import { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, FolderOpen, Save, Library, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { clamp } from '../../lib/math';
import { rgbToHex } from '../../lib/color';
import { cls, segmentButton, PanelSection, IconButton, StepperInput } from '../ui';

export const PalettePanel = ({ settings, updateSetting, paletteData, onPaletteAction }) => {
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [tempColorCount, setTempColorCount] = useState(settings.paletteSize.toString());
    const paletteImportRef = useRef(null); const extractInputRef = useRef(null);
    const exportMenuRef = useRef(null);
    useEffect(() => setTempColorCount(settings.paletteSize.toString()), [settings.paletteSize]);
    const applyColorCount = (val) => { let num = clamp(parseInt(val) || 2, 2, 256); updateSetting('paletteSize', num); setTempColorCount(num.toString()); };

    // Close the export dropdown on any click/touch outside its container, or on Escape.
    useEffect(() => {
        if (!showExportMenu) return;
        const onDown = (e) => { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false); };
        const onKey = (e) => { if (e.key === 'Escape') setShowExportMenu(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [showExportMenu]);

    const EXPORT_OPTIONS = (settings.ditherCategory === 'analytical' && settings.ditherSubMethod !== 'best-match')
        ? ['hex', 'json', 'gpl', 'zip: Color', 'zip: B&W']
        : ['hex', 'json', 'gpl', 'zip: Cricut (Color)', 'zip: Cricut (B&W)', 'zip: Progressive (Color)', 'zip: Progressive (B&W)'];

    return (
        <PanelSection title="Palette">
            <div className="flex justify-between items-center">
                <div className="flex gap-0.5 items-center">
                    <IconButton icon={Lock} onClick={() => onPaletteAction.toggleAllLocks(true)} title="Lock All" />
                    <IconButton icon={Unlock} onClick={() => onPaletteAction.toggleAllLocks(false)} title="Unlock All" />
                    <div className="w-px h-3 mx-1.5 bg-neutral-300 dark:bg-neutral-700"></div>
                    <IconButton icon={FolderOpen} onClick={() => paletteImportRef.current?.click()} title="Import Palette File" />
                    <input type="file" ref={paletteImportRef} className="hidden" accept=".json,.hex,.gpl,.pal,.txt" onChange={(e) => { onPaletteAction.import(e.target.files?.[0]); e.target.value = null; }} />
                    <div className="relative" ref={exportMenuRef}>
                        <IconButton icon={Save} onClick={() => setShowExportMenu(!showExportMenu)} title="Export Palette" />
                        {showExportMenu && (
                            <div className="absolute top-full left-0 mt-1 w-56 shadow-xl z-50 flex flex-col border bg-white border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700">
                                {EXPORT_OPTIONS.map(fmt => <button key={fmt} onClick={() => { onPaletteAction.export(fmt); setShowExportMenu(false); }} className="menu-item">{fmt}</button>)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-0.5 items-center">
                    <IconButton icon={Library} onClick={() => onPaletteAction.openLibrary()} title="Palette Library" />
                    <IconButton icon={ImageIcon} onClick={() => extractInputRef.current?.click()} title="Extract from Frame" />
                    <input type="file" ref={extractInputRef} className="hidden" accept="image/*" onChange={(e) => onPaletteAction.extractFromImage(e.target.files?.[0])} />
                    <IconButton icon={RefreshCw} onClick={() => updateSetting('genSeed', s => s + 1)} title="Reseed Auto-Extraction" />
                </div>
            </div>
            <div className="flex justify-between items-center">
                <span className="field-label">Color Count</span>
                <StepperInput className="w-32" value={tempColorCount} onChange={(e) => setTempColorCount(e.target.value)} onBlur={() => applyColorCount(tempColorCount)} onKeyDown={(e) => e.key === 'Enter' && applyColorCount(tempColorCount)} onDecrease={() => applyColorCount(settings.paletteSize - 1)} onIncrease={() => applyColorCount(settings.paletteSize + 1)} />
            </div>
            <div className={cls.segmentGroup}>{[2, 4, 8, 16, 32, 64, 128, 256].map(p => <button key={p} onClick={() => applyColorCount(p)} className={segmentButton(settings.paletteSize === p)}>{p}</button>)}</div>
            <div className="grid grid-cols-10 gap-0.5 max-h-40 overflow-y-auto custom-scrollbar">
                {paletteData.displayed.map((color, i) => (
                    <div 
                        key={color.id || i} 
                        onClick={(e) => {
                            e.preventDefault();
                            if (color.locked) onPaletteAction.deleteColor(color.id);
                            else onPaletteAction.toggleLock(color.id);
                        }}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            onPaletteAction.openEditor(color.id, e.currentTarget);
                        }}
                        className={`aspect-square border cursor-pointer relative ${color.locked ? 'ring-1 ring-inset ring-white/50 border-neutral-900' : 'border-transparent'}`} 
                        style={{ backgroundColor: rgbToHex(color.displayR, color.displayG, color.displayB) }}
                        title={color.locked ? "Click to delete. Right-click to edit." : "Click to lock. Right-click to edit."}
                    >
                        {color.locked && <div className="absolute inset-0 flex items-center justify-center opacity-30"><Lock size={8} className="text-white drop-shadow-md" /></div>}
                    </div>
                ))}
            </div>
        </PanelSection>
    );
};
