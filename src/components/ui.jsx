import { useState, useEffect, useRef } from 'react';

// Atom components for the design system. Each atom delegates its visual style
// to a function-named CSS class in index.css (`.field-input`, `.field-select`,
// `.field-range`, `.segment-button`, `.panel-title`, …) so the role is
// readable at the call site and the styles live in one place.
//
// `cls` collects compound utility strings that don't warrant a named CSS class
// — pure layout/chrome shapes used by atoms (popover, divider, segmentGroup,
// section) and the ghost-button hover treatment shared by IconButton,
// StepperInput, and FloatingToolbar's compare button.
export const cls = {
    buttonGhost:  "p-1 transition-colors text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-neutral-800/50",
    popover:      "fixed z-50 shadow-2xl p-4 border bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700",
    divider:      "w-full h-px bg-neutral-200 dark:bg-neutral-800",
    segmentGroup: "flex p-0.5 gap-0.5 border bg-neutral-100 border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800",
    section:      "flex flex-col gap-1.5",
};

// One segment of a multi-option picker (color count, bayer matrix size, …).
// Active-state colors live here because they depend on selection state and
// can't be expressed in a static CSS class.
export const segmentButton = (isActive) =>
    `segment-button ${
        isActive
            ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
            : "hover:text-neutral-900 dark:hover:text-neutral-300"
    }`;

export const PanelSection = ({ title, action, children }) => (
    <section className={cls.section}>
        {(title || action) && (
            <div className="flex justify-between items-end">
                {title && <h3 className="panel-title" style={{marginBottom: 0}}>{title}</h3>}
                {action}
            </div>
        )}
        {children}
    </section>
);

// NumberInput buffers the value while the user is typing so that a clamp/format
// in the parent's onChange doesn't fight live keystrokes. Without this, typing
// "15" into a field constrained to ≥2 fails: the "1" gets clamped to "2" before
// the user can type the "5". Now the parent only sees the value on commit
// (blur or Enter); mid-typing, the local buffer is shown verbatim. Escape
// reverts to the parent's last value without committing.
export const NumberInput = ({ value, onChange, label, className = "" }) => {
    const [buf, setBuf] = useState(String(value));
    const editingRef = useRef(false);
    // Sync external value into buffer only while NOT actively editing.
    useEffect(() => { if (!editingRef.current) setBuf(String(value)); }, [value]);
    const commit = () => {
        editingRef.current = false;
        // Synthesize a minimal change event so existing callers (which read
        // e.target.value) keep working unchanged.
        onChange?.({ target: { value: buf } });
    };
    const revert = () => { editingRef.current = false; setBuf(String(value)); };
    return (
        <div className={`relative flex items-center ${className}`}>
            {label && <span className="absolute left-2 text-xs font-bold text-neutral-400 pointer-events-none">{label}</span>}
            <input
                type="number"
                value={buf}
                onFocus={() => { editingRef.current = true; }}
                onChange={e => setBuf(e.target.value)}
                onBlur={commit}
                onKeyDown={e => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    else if (e.key === 'Escape') { revert(); e.currentTarget.blur(); }
                }}
                className={`field-input w-full font-mono ${label ? 'pl-6' : ''}`}
            />
        </div>
    );
};

export const Select = ({ value, onChange, options, optgroups, className = "" }) => (
    <select value={value} onChange={onChange} className={`field-select ${className}`}>
        {optgroups ? Object.entries(optgroups).map(([label, opts]) => (
            <optgroup key={label} label={label}>
                {opts.map(o => <option key={o.value} value={o.value} title={o.title}>{o.label}</option>)}
            </optgroup>
        )) : options?.map(o => <option key={o.value} value={o.value} title={o.title}>{o.label}</option>)}
    </select>
);

export const RangeSlider = ({ value, min, max, step, onChange, className = "" }) => (
    <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className={`field-range ${className}`} />
);

export const IconButton = ({ onClick, icon: Icon, title, className = "" }) => (
    <button onClick={onClick} className={`${cls.buttonGhost} ${className}`} title={title}>
        <Icon size={14} />
    </button>
);

export const StepperInput = ({ value, onDecrease, onIncrease, onChange, onBlur, onKeyDown, className = "" }) => (
    <div className={`flex items-center border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950 ${className}`}>
        <button onClick={onDecrease} className={`${cls.buttonGhost} px-2 py-0.5 hover:bg-neutral-500/10`}>-</button>
        {/* flex-1 + min-w-0 so the input fills whatever width the parent grants */}
        <input type="text" value={value} onChange={onChange} onBlur={onBlur} onKeyDown={onKeyDown} className="flex-1 min-w-0 text-center text-xs py-0.5 m-0 border-none bg-transparent focus:outline-none text-neutral-800 dark:text-neutral-200" />
        <button onClick={onIncrease} className={`${cls.buttonGhost} px-2 py-0.5 hover:bg-neutral-500/10`}>+</button>
    </div>
);
