import { BookOpen, X } from 'lucide-react';
import { cls } from '../ui';
import { activeReferences } from '../../lib/references';

// Modal listing the published algorithms / color spaces engaged by the
// CURRENT settings — opened by clicking the Layers icon next to the app
// title. References are pulled from the catalog in lib/references.js and
// filtered by the current configuration; flipping dither or color-transfer
// modes changes which entries appear here. Citations are best-effort and
// should be validated against primary sources before formal use.
export const ReferencesModal = ({ isOpen, onClose, settings }) => {
    if (!isOpen) return null;
    const refs = activeReferences(settings);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className={`${cls.popover} w-full max-w-lg flex flex-col shadow-2xl`} style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-2"><BookOpen className="w-4 h-4 text-neutral-500" /><span className="modal-title">References</span></div>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><X size={16} /></button>
                </div>
                <p className="source-note mb-3">
                    Published works behind the algorithms and color spaces currently selected. Switch dither methods, color spaces, or color-transfer modes to see the citations change. Citations are best-effort and not yet validated against primary sources.
                </p>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                    {refs.length === 0 ? (
                        <div className="empty-message p-3 border border-neutral-200 dark:border-neutral-800">
                            No published references for the current configuration.
                        </div>
                    ) : (
                        <ul className="space-y-3">
                            {refs.map(r => (
                                <li key={r.id} className="border p-3 border-neutral-200 dark:border-neutral-800">
                                    <div className="flex items-baseline justify-between gap-2 mb-1">
                                        <span className="field-label">{r.name}</span>
                                    </div>
                                    <p className="text-xs italic text-neutral-700 dark:text-neutral-300 mb-1">{r.title}</p>
                                    <p className="text-xs text-neutral-700 dark:text-neutral-300 mb-2">{r.description}</p>
                                    <p className="source-note">{r.citation}</p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};
