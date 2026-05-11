import { Trash, X, Link as LinkIcon, Unlink, Dices } from 'lucide-react';
import { rgbToHex } from '../../lib/color';
import { cls, NumberInput } from '../ui';

export const ColorEditor = ({ color, onClose, onDelete, position, onUpdateLogic, onUpdatePaint, onToggleLock, isLinked, onToggleLink, onUpdateOffset, settings }) => {
    if (!color) return null;
    const logicHex = rgbToHex(color.r, color.g, color.b); const paintHex = rgbToHex(color.displayR, color.displayG, color.displayB);
    return (
        <div className={`${cls.popover} !p-3 flex flex-col gap-2`} style={{ top: position.top, left: position.left, width: '11rem' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center">
                <span className="field-label">Edit Color</span>
                <div className="flex items-center gap-1.5">
                    <button onClick={() => onDelete(color.id)} className="text-neutral-400 hover:text-red-500 transition-colors dark:text-neutral-500" title="Delete Color"><Trash size={14} /></button>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-800 transition-colors dark:text-neutral-500 dark:hover:text-white"><X size={14} /></button>
                </div>
            </div>
            <div className="flex items-center justify-center gap-4">
                <div className="flex flex-col items-center gap-1"><div className="relative w-10 h-10 border overflow-hidden shadow-inner"><div className="absolute inset-0" style={{background: logicHex}}></div><input type="color" value={logicHex} onChange={(e) => onUpdateLogic(color.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></div><span className="hex-code">{logicHex}</span></div>
                <button onClick={onToggleLink} className={isLinked ? 'text-neutral-400' : 'text-neutral-200'}>{isLinked ? <LinkIcon size={14} /> : <Unlink size={14} />}</button>
                <div className="flex flex-col items-center gap-1"><div className="relative w-10 h-10 border overflow-hidden shadow-inner"><div className="absolute inset-0" style={{background: paintHex}}></div><input type="color" value={paintHex} onChange={(e) => onUpdatePaint(color.id, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" /></div><span className="hex-code">{paintHex}</span></div>
            </div>
            <div className={`${cls.divider} my-0.5`}></div>
            {color.locked && settings.ditherCategory === 'pattern' && (
                <div className="flex flex-col gap-1 mb-0.5">
                    <div className="flex justify-between items-center">
                        <span className="field-label-xs">Offset</span>
                        {settings.ditherSubMethod === 'halftone' && <button onClick={() => onUpdateOffset(color.id, Math.floor(Math.random() * 32), Math.floor(Math.random() * 32))} className="text-neutral-400 hover:text-neutral-900 transition-colors dark:text-neutral-500 dark:hover:text-white" title="Randomize Offset"><Dices size={10} /></button>}
                    </div>
                    <div className="flex gap-1.5">
                        <NumberInput label="X" value={color.offsetX || 0} onChange={e => onUpdateOffset(color.id, e.target.value, undefined)} />
                        <NumberInput label="Y" value={color.offsetY || 0} onChange={e => onUpdateOffset(color.id, undefined, e.target.value)} />
                    </div>
                </div>
            )}
            <button onClick={(e) => onToggleLock(color.id, e)} className={`w-full py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${color.locked ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-600'}`}>{color.locked ? 'Locked' : 'Unlocked'}</button>
        </div>
    );
};
