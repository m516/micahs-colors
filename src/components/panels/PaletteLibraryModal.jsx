import { useState, useEffect } from 'react';
import { Library, X, Dices } from 'lucide-react';
import { LOSPEC_PRESETS, PRESET_PALETTES, lospecPreviewCache, lospecPreviewInFlight, fetchLospecPalette, extractLospecSlug, findNearestPresetSlugs, registerKnownPresetSlug } from '../../lib/palettes';
import { cls, Select } from '../ui';

export const PaletteLibraryModal = ({ isOpen, onClose, onApply }) => {
    const categories = [...Object.keys(PRESET_PALETTES), 'Lospec'];
    const [activeCategory, setActiveCategory] = useState(categories[0]);
    const [lospecQuery, setLospecQuery] = useState('');
    const [shuffleSlugs, setShuffleSlugs] = useState(null); // null = no active shuffle
    // Bumped after each background preview fetch / state transition so the modal
    // re-renders with the new module-level cache contents.
    const [, setPreviewVersion] = useState(0);
    const safeCategory = categories.includes(activeCategory) ? activeCategory : categories[0];

    // Regex filtering: every slug is plain alphanumeric+hyphens, so no slug contains
    // regex special chars -- which means novice substring queries ("endesga") work
    // unchanged, while power users get anchors and alternation ("64$", "^aap-",
    // "(gb|gameboy)"). Invalid / mid-typed regex falls back to literal substring
    // matching so the field stays responsive while typing brackets, etc.
    const q = lospecQuery.trim();
    // Normalize the input for fetch lookups: strips URL wrapping, lowercases,
    // drops non-slug chars. Empty string if nothing usable.
    const cleanSlug = extractLospecSlug(q);
    // When the user pastes a Lospec URL, filter by the extracted slug rather
    // than the raw URL — otherwise the regex would try to match "https://…"
    // against bare slugs and return 0.
    const looksLikeLospecUrl = /(?:lospec\.com\/palette-list\/|lospec-palette:\/\/)[a-z0-9-]/i.test(q);
    const filterTerm = looksLikeLospecUrl ? cleanSlug : q;
    const filteredPresets = (() => {
        if (!filterTerm) return LOSPEC_PRESETS;
        try {
            const re = new RegExp(filterTerm, 'i');
            return LOSPEC_PRESETS.filter(s => re.test(s));
        } catch {
            const lit = filterTerm.toLowerCase();
            return LOSPEC_PRESETS.filter(s => s.toLowerCase().includes(lit));
        }
    })();

    // "Trial" entry: a slug derived from user input that isn't already a known
    // preset. Shows as a row at the top of the list and auto-fetches after a
    // 1-second debounce (effect below). Lospec hosts thousands of palettes;
    // LOSPEC_PRESETS is just the 300 most popular, so this lets the user
    // discover anything on the site by typing/pasting its slug or URL.
    //
    // forceTrial keeps the trial row visible once a fetch has been initiated
    // (debounced or via Enter), even if filter matches would otherwise hide
    // it — so the user always gets to see the result of their explicit action.
    const isCleanSlugAPreset = !!cleanSlug && LOSPEC_PRESETS.includes(cleanSlug);
    const forceTrial = !!cleanSlug && (lospecPreviewCache.has(cleanSlug) || lospecPreviewInFlight.has(cleanSlug));
    const trialSlug = (cleanSlug && !isCleanSlugAPreset && (looksLikeLospecUrl || filteredPresets.length === 0 || forceTrial))
        ? cleanSlug
        : null;

    // When the trial fetch came back as an error, offer the 5 nearest known
    // slugs (by Levenshtein distance) as "did you mean?" suggestions. Filter
    // out anything already visible to avoid duplicates.
    const trialCacheEntry = trialSlug ? lospecPreviewCache.get(trialSlug) : null;
    const trialFailed = !!trialCacheEntry?.error;
    const suggestions = trialFailed
        ? findNearestPresetSlugs(trialSlug, 5).filter(s => s !== trialSlug && !filteredPresets.includes(s))
        : [];

    // Top-3 auto-preview: in shuffle mode, preload all 3 random picks so the
    // user sees previews immediately; otherwise the first 3 of the filter
    // matches. The trial row has its own debounced fetch (below) and the
    // suggestions stay click-to-preview to keep the network burst small.
    const toPreload = shuffleSlugs || filteredPresets.slice(0, 3);

    // Fire-and-forget preview fetch. Module-level cache and in-flight set survive
    // modal close/reopen and Strict-mode double-effect-invoke.
    const triggerPreviewFetch = (slug) => {
        if (lospecPreviewInFlight.has(slug)) return;
        // If we have a stale error cached, clear it so the click feels like a retry.
        if (lospecPreviewCache.get(slug)?.error) lospecPreviewCache.delete(slug);
        lospecPreviewInFlight.add(slug);
        setPreviewVersion(v => v + 1); // immediate "Loading…" feedback
        (async () => {
            try {
                const data = await fetchLospecPalette(slug);
                lospecPreviewCache.set(slug, data);
            } catch (e) {
                lospecPreviewCache.set(slug, { error: e.message || String(e) });
            } finally {
                lospecPreviewInFlight.delete(slug);
                setPreviewVersion(v => v + 1);
            }
        })();
    };

    // Auto-preload the top 3 of the visible list on mount and whenever the visible
    // slugs change (filter/shuffle/category switch).
    useEffect(() => {
        if (!isOpen || safeCategory !== 'Lospec') return;
        toPreload.forEach(slug => {
            if (!lospecPreviewCache.has(slug) && !lospecPreviewInFlight.has(slug)) {
                triggerPreviewFetch(slug);
            }
        });
    }, [isOpen, safeCategory, toPreload.join('|')]);

    // Debounced trial fetch: 1s after the user stops typing, try to fetch the
    // trial slug from Lospec. Equivalent to clicking "Load" but auto-triggered
    // and producing a preview row rather than committing. The debounce keeps
    // us from spamming the API while the user is mid-paste / mid-typo.
    useEffect(() => {
        if (!isOpen || safeCategory !== 'Lospec' || !trialSlug) return;
        if (lospecPreviewCache.has(trialSlug) || lospecPreviewInFlight.has(trialSlug)) return;
        const timer = setTimeout(() => triggerPreviewFetch(trialSlug), 1000);
        return () => clearTimeout(timer);
    }, [isOpen, safeCategory, trialSlug]);

    if (!isOpen) return null;

    // Re-roll: 3 random slugs without replacement.
    const handleShuffle = () => {
        const picks = [];
        const pool = [...LOSPEC_PRESETS];
        for (let i = 0; i < 3 && pool.length > 0; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        setShuffleSlugs(picks);
        setLospecQuery('');
    };

    const handleQueryChange = (e) => {
        setLospecQuery(e.target.value);
        setShuffleSlugs(null); // typing exits shuffle mode
    };

    // One unified click handler for every row in the visible list:
    //   - Cached with colors  -> apply + close (the "commit" click)
    //   - In flight           -> no-op (already loading)
    //   - Anything else       -> trigger fetch, leave modal open (the "preview" click)
    // This is the user's "click to preview, click again to commit" pattern.
    const handleSlugClick = (slug) => {
        const cached = lospecPreviewCache.get(slug);
        if (cached?.colors) {
            // If this was a trial slug (user-discovered, not in the curated
            // top-N), promote it to a known preset so future filters/counts
            // include it.
            registerKnownPresetSlug(slug);
            onApply(cached.colors);
            return;
        }
        if (lospecPreviewInFlight.has(slug)) return;
        triggerPreviewFetch(slug);
    };

    // Renders one entry of the unified list. Visual state depends on cache:
    // loaded -> full preview card (swatches + author + count); error -> dimmed
    // row with retry affordance; in flight -> skeleton row; uncached -> compact
    // clickable row hinting "click to preview".
    const SlugEntry = ({ slug }) => {
        const cached = lospecPreviewCache.get(slug);
        const colors = cached?.colors;
        const error = cached?.error;
        const inFlight = lospecPreviewInFlight.has(slug);
        return (
            <div
                onClick={() => handleSlugClick(slug)}
                title={colors ? 'Click to apply' : error ? `Error: ${error} — click to retry` : inFlight ? 'Loading…' : 'Click to load preview'}
                className={`border transition-all cursor-pointer border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800 ${error ? 'opacity-70' : ''} ${colors ? 'p-3' : 'px-3 py-2'}`}
            >
                <div className={`flex justify-between items-baseline gap-2 text-xs ${colors ? 'mb-1.5 font-bold' : ''}`}>
                    <span className="font-mono truncate text-neutral-700 dark:text-neutral-300">{slug}</span>
                    <span className="font-normal flex-shrink-0 text-neutral-400 dark:text-neutral-500">
                        {colors ? `${cached.author ? cached.author + ' · ' : ''}${colors.length} colors`
                            : error ? 'Unavailable · click to retry'
                            : inFlight ? 'Loading…'
                            : ''}
                    </span>
                </div>
                {colors && (
                    <div className="grid gap-0 overflow-hidden shadow-sm border border-transparent"
                         style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(4, 100/colors.length)}%, 1fr))`,
                                  height: colors.length > 64 ? '64px' : colors.length > 32 ? '48px' : '32px' }}>
                        {colors.map((c, i) => <div key={i} style={{backgroundColor: c, width: '100%', height: '100%'}} />)}
                    </div>
                )}
                {inFlight && !colors && <div className="h-6 animate-pulse mt-1 bg-neutral-200/50 dark:bg-neutral-800/50" />}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className={`${cls.popover} w-full max-w-lg flex flex-col shadow-2xl`} style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="flex items-center gap-2"><Library className="w-4 h-4 text-neutral-500" /><span className="modal-title">Palette Library</span></div>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"><X size={16} /></button>
                </div>
                <div className="flex flex-col mb-4">
                    <Select value={safeCategory} onChange={e => { setActiveCategory(e.target.value); setLospecError(''); }} options={categories.map(c => ({value: c, label: c}))} />
                    {safeCategory === 'Lospec' ? (
                        <p className="source-note mt-2">
                            Source: <a href="https://lospec.com/palette-list" target="_blank" rel="noreferrer" className="underline hover:text-neutral-300">lospec.com/palette-list</a>. Click a slug to load its preview; click the preview to apply. Top 3 of the visible list auto-preview.
                        </p>
                    ) : PRESET_PALETTES[safeCategory]?._source && (
                        <p className="source-note mt-2">
                            Source: {PRESET_PALETTES[safeCategory]._source}
                        </p>
                    )}
                </div>

                {safeCategory === 'Lospec' ? (
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                        <div className="flex gap-2 border p-2 sticky top-0 z-10 border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                            <input
                                type="text"
                                value={lospecQuery}
                                onChange={handleQueryChange}
                                onKeyDown={e => {
                                    // Enter is a "fetch now" shortcut that bypasses the 1s
                                    // debounce. Result still appears as a preview row — the
                                    // user clicks it to apply, same as auto-trial.
                                    if (e.key === 'Enter' && cleanSlug && !lospecPreviewCache.has(cleanSlug) && !lospecPreviewInFlight.has(cleanSlug)) {
                                        triggerPreviewFetch(cleanSlug);
                                    }
                                }}
                                placeholder="Filter (regex) · slug · URL"
                                className="flex-1 px-2 py-1 text-xs border bg-transparent focus:outline-none font-mono border-neutral-300 text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
                            />
                            <button
                                onClick={handleShuffle}
                                title="Lucky shuffle: 3 random palettes"
                                className="px-2 py-1 text-xs border transition-colors flex items-center border-neutral-300 hover:bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:text-neutral-300"
                            >
                                <Dices size={12} />
                            </button>
                        </div>

                        <div className="list-count mt-3 mb-2">
                            {shuffleSlugs ? (
                                <>
                                    3 random palettes ·{' '}
                                    <button onClick={() => setShuffleSlugs(null)} className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
                                        show all
                                    </button>
                                </>
                            ) : filterTerm
                                ? `${filteredPresets.length} of ${LOSPEC_PRESETS.length} match /${filterTerm}/i`
                                : `${LOSPEC_PRESETS.length} popular palettes`}
                        </div>

                        {shuffleSlugs ? (
                            <div className="space-y-1">
                                {shuffleSlugs.map(slug => <SlugEntry key={slug} slug={slug} />)}
                            </div>
                        ) : (
                            <>
                                {/* Trial row: user-typed slug/URL not already a known preset.
                                    Shows a loading skeleton, then preview swatches on success
                                    or "Unavailable" on failure (after which suggestions appear). */}
                                {trialSlug && (
                                    <div className="space-y-1">
                                        <SlugEntry key={trialSlug} slug={trialSlug} />
                                    </div>
                                )}
                                {trialFailed && suggestions.length > 0 && (
                                    <>
                                        <div className="field-label mt-3 mb-1">Did you mean?</div>
                                        <div className="space-y-1">
                                            {suggestions.map(slug => <SlugEntry key={slug} slug={slug} />)}
                                        </div>
                                    </>
                                )}
                                {filteredPresets.length > 0 && (
                                    <div className={`space-y-1 ${trialSlug || suggestions.length ? 'mt-3' : ''}`}>
                                        {filteredPresets.map(slug => <SlugEntry key={slug} slug={slug} />)}
                                    </div>
                                )}
                                {!trialSlug && filteredPresets.length === 0 && (
                                    <div className="empty-message p-3 border border-neutral-200 dark:border-neutral-800">
                                        No matches for "{q}".
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                        {Object.keys(PRESET_PALETTES[safeCategory] || {}).filter(k => k !== '_source').map((name) => {
                            const colors = PRESET_PALETTES[safeCategory][name];
                            return (
                                <div key={name} className="border p-3 cursor-pointer transition-all border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800" onClick={() => onApply(colors)}>
                                    <div className="text-xs font-bold mb-2 flex justify-between"><span className="text-neutral-700 dark:text-neutral-300">{name}</span><span className="text-neutral-500">{colors.length} colors</span></div>
                                    <div className={`grid gap-0 overflow-hidden shadow-sm border border-transparent`} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${Math.max(4, 100/colors.length)}%, 1fr))`, height: colors.length > 32 ? '64px' : '32px' }}>
                                        {colors.map((c, i) => <div key={i} style={{backgroundColor: c, width: '100%', height: '100%'}}></div>)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
