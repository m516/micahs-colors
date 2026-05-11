// Lospec palette presets and the live-fetch utility. The PRESET_PALETTES catalog
// below is hardcoded (curated). LOSPEC_PRESETS is a popularity-ordered list of
// slugs that the library modal fetches on demand via fetchLospecPalette.

// Popularity-ordered list of Lospec palette slugs. Source: lospec.com/palette-list
// sorted by popularity. The fetch handles 404s gracefully with an inline error, so
// retired or misspelled entries simply show "not found" on click rather than breaking.
export const LOSPEC_PRESETS = [
    'resurrect-64', 'endesga-32', 'apollo', 'lospec500', 'endesga-64', 'cc-29', 'slso8',
    'pear36', 'aap-64', 'oil-6', 'duel', 'sweetie-16', '31', 'pico-8', 'vinik24',
    'fantasy-24', 'journey', 'nintendo-entertainment-system', 'lost-century', 'zughy-32',
    'na16', 'mulfok32', 'midnight-ablaze', '1bit-monitor-glow', 'wplace-palette-free-colours',
    'twilight-5', 'steam-lords', 'nyx8', 'aurora', 'famicube', 'blk-nx64', 'waldgeist',
    'blessing', 'wplace-colors', 'eulbink', 'rust-gold-8', 'ice-cream-gb', 'ammo-8',
    'kirokaze-gameboy', '2bit-demichrome', 'borkfest', 'lux2k', 'dawnbringer-32',
    'twilioquest-76', 'mushroom', 'island-joy-16', 'comfort44s', 'jehkoba64', 'resurrect-32',
    'chocomilk-8', 'pollen8', 'justparchment8', 'chasm', 'blk-neo', 'aap-splendor128',
    'lava-gb', 'berry-nebula', 'hollow', 'indecision', 'japanese-woodblock', 'comfy52',
    'nanner-pancakes', 'endesga-16', 'vines-flexible-linear-ramps', 'matt36', 'dreamscape8',
    'windows-95-256-colours', 'ink', 'funkyfuture-8', 'pico-8-secret-palette', 'sheltzy32',
    'vanilla-milkshake', 'inkpink', 'mist-gb', 'fleja-master-palette', 'curiosities',
    'moonlight-gb', 'ink-crimson', 'bubblegum-16', 'citrink', 'aerugo', 'cl8uds',
    'gothic-bit', 'srb2', 'commodore64', 'rosy-42', 'rustic-gb', 'nanner-32', 'fading-16',
    'downgraded-32', 'ayy4', 'endesga-36', 'lux3k', 'nintendo-gameboy-bgb', 'cryptic-ocean',
    'the-perfect-palette-20', 'punolite-plus-remake', 'hope-diamond', 'wish-gb',
    '2-bit-grayscale', 'afr-32', 'pineapple-32', 'gora63', 'dawnbringer-16', 'nostalgia',
    'bloodmoon21', 'lost-century-24', 'softmilk-32', 'hept32', 'blk-36', 'crimson',
    'nopal-12', 'paper-8', 'fantasy', 'dream-haze-8', 'sonic-robo-blast-2-v22',
    'slso-clr17', 'iridescent-crystal', 'microsoft-windows', 'juice56', 'lospec-2000',
    'luap-40', 'late-night-bath', 'calm-48', 'ephemera', 'pastel-qt',
    'hot-highlights-cold-shadows', 'paperback-2', 'sweet-canyon-extended-64', 'playpal',
    'capp-5', 'blk-aqu4', 'grim32', 'spacehaze', 'dawnbringers-8-color', 'grayscale-16',
    'tranquil-fantasy-23', 'darkseed-16', 'retrocal-8', 'cretaceous-16', 'minecraft-64',
    'mega-drive-blue', 'winter-wonderland', 'seafoam', 'grape-soda', 'sirens-at-night',
    'velvet-cherry-gb', 'jehkoba32', 'sage57', 'cyclope6', 'bastille-8', 'slimy-05',
    'arq4', 'galaxy-flame', 'zenit-241', 'dreamy-forest', 'color-graphics-adapter',
    'lacking64', 'equpix15', 'nes-advanced', 'fairydust-8', 'pokemon-sgb', 'golden-helmet',
    'sunset-red', 'links-awakening-sgb', 'nicole-punk-82', 'bittersweet', 'florentine24',
    'minecraft-map-palette-for-117', 'soda-cap', 'neon-space', 'atropoeia',
    'the-y-gigante-reverted', 'shovel-knight-nes', 'titanstone', 'nes-aesprite', 'rewild-64',
    'gold-gb', 'aap-micro12', 'fiery-plague-gb', 'sunset', 'wlk44-v2', 'tofu-20k',
    'axulart-32-color-palette', '6-bit-rgb', 'juice32', 'cheese-palette', 'leopolds-dreams',
    'archimedes-64', 'smooth-polished-gold', 'nightsky-bricks', 'hallowpumpkin', 'punolit',
    'calm-sunset', 'pokemon-ruby-sapphire-exterior', 'pastel-64', 'dynasty38',
    'arcade-standard-29', 'atari-8-bit-family-gtia', 'uncured-official', 'deep-maze',
    'nymph-gb', 'nintendo-super-gameboy', 'miyazaki-16', 'carnival-32', 'glomzy-05',
    'purplemorning8', 'ufo-50', 'moonlight-15', 'quake', 'the-crow', 'gray-weather',
    'punolite-plus-plus', 'pola5', 'sunraze', 'bluem0ld', 'fuzzyfour', 'marshmellow32',
    'dnot-froget', 'mojave20', 'autumn-decay', 'golden-flame', 'linear-color-palette-basic',
    'mort-vs-zughy', 'custodian-8', 'dustbyte', 'gob-48', 'lospec-gb', 'aquaverse',
    'supernova-7', 'summers-past-16', 'red-blood-pain', 'andrade-gameboy', 'sweet24',
    'coldfire-gb', 'dead-weight-8', 'hydrangea-11', 'sonic-mania-main-palette', 'toasted40',
    'sobeachy8', 'archerer48', 'autumn-harvest-37', 'cloudfrenzy', 'dynamite',
    'antiquity16', 'shido-cyberneon', 'greenstar32', 'en4', 'aren32', 'arch',
    'ludpiratepalette128', 'wintercode', 'diverse-natural', 'otterisk-96', 'akc12',
    'soapy-10', 'smooth-polished-silver', 'uzebox', 'odd-feeling', 'poisson-23', 'smoky-09',
    'parchment-and-ink', 'taffy-16', 'general', 'bath-house', 'crayola84', 'cybergum6',
    'mahyellaw-22', 'brazilian-afternoon', 'sailor-moon-background', 'heart4', 'purpledawn',
    'pax-24', 'gun-metal-russia', 'the-wood', 'fluffy8', 'cga-palette-1-high', 'zx-spectrum',
    'abyss-9', 'molten', 'isas-true-master-palette', 'clement-8', 'the-perfect-palette',
    'matriax8c', 'hot-sand-6', 'cs112-v2', 'retrotronic', 'skin-neutral-colors', 'r-place',
    'aap-radiantplus', 'waverator', 'touhou-pc-9801', 'faraway48', 'glomzy-06', 'old-z64',
    'edg77', 'adventure28', 'nanner-jam', '24p-dx', 'meadowvale',
];

// Per-session preview cache for Lospec palettes. Module-level so it survives modal
// open/close. Each entry is either { name, author, colors } on success or { error }
// on failure. Cleared on page reload.
export const lospecPreviewCache = new Map();
// Tracks slugs whose fetch is currently in flight, so React strict-mode's
// double-effect-invoke doesn't trigger two parallel requests for the same slug.
export const lospecPreviewInFlight = new Set();

// Normalize anything the user might paste into the search bar — bare slug,
// Lospec web URL, or the lospec-palette:// custom URI — into a clean slug
// string suitable for the JSON endpoint. Returns '' if nothing usable can be
// extracted.
//
// The custom-URI branch is important: without explicit handling, the `:` and
// `//` got stripped and concatenated into the rest, producing slugs like
// "lospec-palettegreyt-bit".
export const extractLospecSlug = (raw) => {
    if (!raw) return '';
    const fromUri = raw.match(/(?:lospec\.com\/palette-list\/|lospec-palette:\/\/)([a-z0-9-]+)/i);
    return (fromUri ? fromUri[1] : raw)
        .trim().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
};

// Classic two-row Levenshtein distance. Used to suggest "did you mean"
// candidates from LOSPEC_PRESETS when a direct fetch 404s — Lospec has
// thousands of palettes and the user might be one typo away from the one
// they want. ~300 presets × ~12-char slugs → sub-millisecond per query.
const levenshtein = (a, b) => {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        for (let j = 1; j <= n; j++) {
            const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[n];
};

// The n closest known-preset slugs to `query` by Levenshtein distance.
// Ties broken by popularity (LOSPEC_PRESETS order).
export const findNearestPresetSlugs = (query, n = 5) => {
    if (!query) return [];
    return LOSPEC_PRESETS
        .map((slug, popularityRank) => ({ slug, dist: levenshtein(query, slug), popularityRank }))
        .sort((a, b) => a.dist - b.dist || a.popularityRank - b.popularityRank)
        .slice(0, n)
        .map(x => x.slug);
};

// Append a successfully-fetched-and-applied slug to the known-preset list so
// future filters, fuzzy-matches, and the count reflect the user's discovery.
// Appended (not prepended) because LOSPEC_PRESETS is popularity-ordered and
// these slugs are outside the curated top-N by definition. Module-level
// mutation: survives across modal open/close like the preview cache; gone
// after page reload.
export const registerKnownPresetSlug = (slug) => {
    if (!slug || LOSPEC_PRESETS.includes(slug)) return false;
    LOSPEC_PRESETS.push(slug);
    return true;
};

export const fetchLospecPalette = async (rawSlug) => {
    const slug = extractLospecSlug(rawSlug);
    if (!slug) throw new Error('Empty or invalid slug.');

    const directUrl = `https://lospec.com/palette-list/${slug}.json`;

    const parse = async (res) => {
        if (!res.ok) {
            if (res.status === 404) throw new Error(`Palette "${slug}" not found on Lospec.`);
            throw new Error(`Lospec returned HTTP ${res.status}.`);
        }
        const data = await res.json();
        if (data?.error) throw new Error(data.error);
        if (!Array.isArray(data?.colors)) throw new Error('Malformed Lospec response.');
        // Lospec returns bare hex like "574368"; the rest of the app expects "#574368".
        return { name: data.name || slug, author: data.author || '', colors: data.colors.map(c => '#' + c.replace(/^#/, '')) };
    };

    // Try a direct fetch first. As of writing, Lospec doesn't send CORS headers, so this
    // throws TypeError("Failed to fetch") in every browser -- but it's a cheap one round trip,
    // and if Lospec ever adds CORS it'll start working with no further code changes.
    try {
        return await parse(await fetch(directUrl));
    } catch (_directErr) {
        // Swallow and fall through to the proxy. (Browser CORS failures look opaque, so we
        // can't tell a 404 from a CORS block at this stage -- the proxy lets us see both.)
    }

    // Fallback: api.allorigins.win/raw. Public, free, no API key, no localhost restriction.
    // If allorigins ever goes down, the user can paste a Lospec .hex/.json file via the
    // Import Palette button or drag-drop instead.
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
        return await parse(await fetch(proxyUrl));
    } catch (proxyErr) {
        throw new Error(`Could not load "${slug}". Lospec blocked the direct request (CORS), and the public proxy also failed (${proxyErr.message || 'network error'}). Check the slug, or try again later.`);
    }
};

export const PRESET_PALETTES = {
  "Nintendo Handhelds": {
    "_source": "Hardware constraints and BIOS presets",
    "Game Boy Classic (BGB)": ["#e0f8d0", "#88c070", "#346856", "#081820"],
    "Game Boy Original 4-Tone": ["#9bbc0f", "#8bac0f", "#306230", "#0f380f"],
    "Game Boy Pocket (Gray)": ["#e3e6c9", "#c6cba4", "#8e8f5e", "#232323"],
    "Game Boy Light (Blue)": ["#00b2a0", "#008a70", "#005240", "#002810"],
    "GBC BIOS - Red": ["#f8e8c8", "#d89048", "#a82820", "#000000"],
    "GBC BIOS - Blue": ["#ffffa8", "#68a8f8", "#0000fc", "#000000"],
    "GBC BIOS - Green": ["#f8e8c8", "#58d854", "#389020", "#000000"],
    "GBC BIOS - Yellow": ["#f8f8f8", "#f8f858", "#a8a800", "#000000"],
    "GBA Branding Scheme": ["#d72424", "#88c834", "#f3f1f2", "#e9d514", "#9999a4", "#153e92"]
  },
  "Retro Home Consoles": {
    "_source": "Hardware architectural gamuts and branding",
    "NES Hardware (55 Colors)": [
        "#7c7c7c", "#0000fc", "#0000bc", "#4428bc", "#940084", "#a80020", "#a81000", "#881400", "#503000", "#007800", "#006800", "#005800", "#004058", "#000000", 
        "#bcbcbc", "#0078f8", "#0058f8", "#6844fc", "#d800cc", "#e40058", "#f83800", "#e45c10", "#ac7c00", "#00b800", "#00a800", "#00a844", "#008888", 
        "#f8f8f8", "#3cbcfc", "#6888fc", "#9878f8", "#f878f8", "#f85898", "#f87858", "#fca044", "#f8b800", "#b8f818", "#58d854", "#58f898", "#00e8d8", "#787878", 
        "#a4e4fc", "#b8b8f8", "#d8b8f8", "#f8b8f8", "#f8a4c0", "#f0d0b0", "#fce0a8", "#f8d878", "#d8f878", "#b8f8b8", "#b8f8d8", "#00fcfc", "#f8d8f8"
    ],
    "SNES US Controller Shell": ["#b5b6e4", "#4f43ae", "#908a99", "#cec9cc", "#211a21"],
    "Super Famicom Shell": ["#a7a4e0", "#514689", "#b2b4b2", "#54585a", "#707372"],
    "SFC Face Buttons": ["#eb1a1d", "#fece15", "#0749b4", "#008d45"],
    "SEGA Master System Hardware": [
        "#000000", "#550000", "#aa0000", "#ff0000", "#005500", "#555500", "#aa5500", "#ff5500", "#00aa00", "#55aa00", "#aaaa00", "#ffaa00", "#00ff00", "#55ff00", "#aaff00", "#ffff00",
        "#000055", "#550055", "#aa0055", "#ff0055", "#005555", "#555555", "#aa5555", "#ff5555", "#00aa55", "#55aa55", "#aaaa55", "#ffaa55", "#00ff55", "#55ff55", "#aaff55", "#ffff55",
        "#0000aa", "#5500aa", "#aa00aa", "#ff00aa", "#0055aa", "#5555aa", "#aa55aa", "#ff55aa", "#00aaaa", "#55aaaa", "#aaaaaa", "#ffaaaa", "#00ffaa", "#55ffaa", "#aaffaa", "#ffffaa",
        "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#0055ff", "#5555ff", "#aa55ff", "#ff55ff", "#00aaff", "#55aaff", "#aaaaff", "#ffaaff", "#00ffff", "#55ffff", "#aaffff", "#ffffff"
    ],
    "SEGA Game Gear System Master": ["#000000", "#555555", "#aaaaaa", "#ffffff", "#550000", "#aa0000", "#ff0000", "#005500", "#00aa00", "#00ff00", "#000055", "#0000aa", "#0000ff", "#aaaa55", "#55aaaa", "#aa55aa"],
    "Atari 2600 NTSC Subset": ["#000000", "#404040", "#808080", "#c0c0c0", "#ffffff", "#b00000", "#ff5050", "#c000b0", "#ff50ff", "#0000b0", "#5050ff", "#00b000", "#50ff50", "#b0b000", "#ffff50", "#b05000"]
  },
  "Vintage Computers": {
    "_source": "Classic PC architecture palettes",
    "IBM PC CGA Mode 4 Pal 0": ["#000000", "#55ff55", "#ff5555", "#ffff55"],
    "IBM PC CGA Mode 4 Pal 1": ["#000000", "#55ffff", "#ff55ff", "#ffffff"],
    "IBM PC CGA 16-Color": ["#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa", "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"],
    "Commodore 64 Pepto Default": ["#000000", "#ffffff", "#880000", "#aaffee", "#cc44cc", "#00cc55", "#0000aa", "#eeee77", "#dd8855", "#664400", "#ff7777", "#333333", "#777777", "#aaff66", "#0088ff", "#bbbbbb"],
    "Apple Macintosh System 8": ["#ffffff", "#fbf305", "#ff6403", "#dd0907", "#f20884", "#4700a5", "#0000d3", "#02abea", "#1fb714", "#006412", "#562c05", "#90713a", "#c0c0c0", "#808080", "#404040", "#000000"]
  },
  "Pixel Art Communities": {
    "_source": "Curated palettes from Lospec",
    "PICO-8 Standard": ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"],
    "DawnBringer DB16": ["#140c1c", "#442434", "#30346d", "#4e4a4e", "#854c30", "#346524", "#d04648", "#757161", "#597dce", "#d27d2c", "#8595a1", "#6daa2c", "#d2aa99", "#6dc2ca", "#dad45e", "#deeed6"],
    "DawnBringer DB32": ["#000000", "#222034", "#45283c", "#663931", "#8f563b", "#df7126", "#d9a066", "#eec39a", "#fbf236", "#99e550", "#6abe30", "#37946e", "#4b692f", "#524b24", "#323c39", "#3f3f74", "#306082", "#5b6ee1", "#639bff", "#5fcde4", "#cbdbfc", "#ffffff", "#9badb7", "#847e87", "#696a6a", "#595652", "#76428a", "#ac3232", "#d95763", "#d77bba", "#8f974a", "#8a6f30"],
    "Lospec T-Lollipop": ["#fce3ef", "#00b2d2", "#4a2e5d", "#1e0521"],
    "Lospec Dream Haze": ["#f4d9b1", "#7fa2a8", "#5e778c", "#495a70", "#3e485e", "#35394d", "#2d2a3d", "#221c29"],
    "Lospec Nostalgic Dreams": ["#e0f8cf", "#86c06c", "#306850", "#071821", "#f8f8a8", "#d04648", "#2c5f8a", "#6abfb0"],
    "Lospec Jehkoba32": ["#20101b", "#3d1e2e", "#612739", "#a3273e", "#e23a41", "#ff7e59", "#ffb261", "#ffe285", "#bceb59", "#6bce56", "#2d9c5b", "#1a5e4d", "#15333b", "#162029", "#243242", "#3a5666", "#518294", "#77b2bd", "#a7d3d1", "#e3eff2", "#abb4b8", "#7a828a", "#545b61", "#33373b", "#1c1e21", "#33222e", "#593144", "#85415a", "#b55977", "#e37f9b", "#ffadc2", "#ffe8ed"]
  },
  "Crayola Crayons": {
    "_source": "Jenny's Crayon Collection subsets mapped by box tier ",
    "8-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000"],
    "16-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680"],
    "24-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4"],
    "32-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4", "#ffae42", "#cd919e", "#fa9d5a", "#b4674d", "#1dacd6", "#fddb6d", "#1cac78", "#5d76cb"],
    "48-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4", "#ffae42", "#cd919e", "#fa9d5a", "#b4674d", "#1dacd6", "#fddb6d", "#1cac78", "#5d76cb", "#ff7f49", "#ea7e5d", "#b0b7c6", "#ffff99", "#1cd3a2", "#dd4492", "#bc5d58", "#dd9475", "#9aceeb", "#ffbcd9", "#2b6cc4", "#efcdb8", "#6e5160", "#ceff1d", "#71bc78", "#6dae81"],
    "64-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4", "#ffae42", "#cd919e", "#fa9d5a", "#b4674d", "#1dacd6", "#fddb6d", "#1cac78", "#5d76cb", "#ff7f49", "#ea7e5d", "#b0b7c6", "#ffff99", "#1cd3a2", "#dd4492", "#bc5d58", "#dd9475", "#9aceeb", "#ffbcd9", "#2b6cc4", "#efcdb8", "#6e5160", "#ceff1d", "#71bc78", "#6dae81", "#c364c5", "#cc6666", "#e7c697", "#fcd975", "#a8e4a0", "#95918c", "#1164b4", "#f0e891", "#ff1dce", "#b2ec5d", "#ca3767", "#3bb08f", "#fefe22", "#fcb4d5", "#1a4876", "#30ba8f"],
    "96-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4", "#ffae42", "#cd919e", "#fa9d5a", "#b4674d", "#1dacd6", "#fddb6d", "#1cac78", "#5d76cb", "#ff7f49", "#ea7e5d", "#b0b7c6", "#ffff99", "#1cd3a2", "#dd4492", "#bc5d58", "#dd9475", "#9aceeb", "#ffbcd9", "#2b6cc4", "#efcdb8", "#6e5160", "#ceff1d", "#71bc78", "#6dae81", "#c364c5", "#cc6666", "#e7c697", "#fcd975", "#a8e4a0", "#95918c", "#1164b4", "#f0e891", "#ff1dce", "#b2ec5d", "#ca3767", "#3bb08f", "#fefe22", "#fcb4d5", "#1a4876", "#30ba8f", "#1974d2", "#ffa343", "#bab86c", "#ff7538", "#ff2b2b", "#f8d568", "#e6a8d7", "#414a4c", "#1ca9c9", "#ffcfab", "#c5d0e6", "#fdd7e4", "#158078", "#fc74fd", "#f780a1", "#8e4585", "#7442c8", "#9d81ba", "#fe4eda", "#ff496c", "#d68a59", "#e3256b", "#ee204d", "#ff5349", "#c0448f", "#1fcecb", "#ff5050", "#f75394", "#eecabe", "#ff9baa", "#fc2847"],
    "120-Count Box": ["#ed0a3f", "#ff861f", "#fbe870", "#0066ff", "#01a368", "#8359a3", "#af593e", "#000000", "#ff3f34", "#ffaacc", "#c5e17a", "#7366bd", "#0095b7", "#bb3385", "#ffffff", "#8b8680", "#03bb85", "#ffdf00", "#0a6b0d", "#8fd8d8", "#a36f40", "#f653a6", "#ca3435", "#ffcba4", "#ffae42", "#cd919e", "#fa9d5a", "#b4674d", "#1dacd6", "#fddb6d", "#1cac78", "#5d76cb", "#ff7f49", "#ea7e5d", "#b0b7c6", "#ffff99", "#1cd3a2", "#dd4492", "#bc5d58", "#dd9475", "#9aceeb", "#ffbcd9", "#2b6cc4", "#efcdb8", "#6e5160", "#ceff1d", "#71bc78", "#6dae81", "#c364c5", "#cc6666", "#e7c697", "#fcd975", "#a8e4a0", "#95918c", "#1164b4", "#f0e891", "#ff1dce", "#b2ec5d", "#ca3767", "#3bb08f", "#fefe22", "#fcb4d5", "#1a4876", "#30ba8f", "#1974d2", "#ffa343", "#bab86c", "#ff7538", "#ff2b2b", "#f8d568", "#e6a8d7", "#414a4c", "#1ca9c9", "#ffcfab", "#c5d0e6", "#fdd7e4", "#158078", "#fc74fd", "#f780a1", "#8e4585", "#7442c8", "#9d81ba", "#fe4eda", "#ff496c", "#d68a59", "#e3256b", "#ee204d", "#ff5349", "#c0448f", "#1fcecb", "#ff5050", "#f75394", "#eecabe", "#ff9baa", "#fc2847", "#93dfb8", "#a5694f", "#8a795d", "#45cea2", "#fb7efd", "#cdc5c2", "#80daeb", "#ecebbd", "#ffcf48", "#fd5e53", "#faa76c", "#fc89ac", "#dbd7d2", "#17806d", "#deaa88", "#77dde7", "#fdfc74", "#926eae", "#8f509d", "#a2add0", "#fc6c85", "#cda4de", "#fdfa72", "#ffb653", "#c5e384"],
    "Colors of the World (24-Count)": ["#513529", "#6e5046", "#88605e", "#986a5a", "#ac8065", "#d19c7d", "#e0b5a4", "#e6b9b3", "#e6d2d3", "#eee6cf", "#5f452e", "#8d5b28", "#a16b4f", "#dea26c", "#f0c9a2", "#eddbc7", "#f0dfcf", "#6c4d4b", "#8f6c68", "#b86f69", "#ee8e99", "#f4afb2", "#fac7c3", "#f7e1e3"]
  },
  "Professional Art Supplies": {
    "_source": "Official Swatch Archives and LEGO Pick a Brick",
    "Lego - solid colors": ["#b40000", "#ca4c0b", "#bb805a", "#91501c", "#e1bea1", "#5f3109", "#aa7d55", "#d67923", "#372100", "#fcac00", "#897d62", "#ccb98d", "#fac80a", "#ffec6c", "#77774e", "#ffff00", "#a5ca18", "#e2f99a", "#00852b", "#00451a", "#708e7c", "#d3f2ea", "#009894", "#68c3e2", "#469bc3", "#1e5aa8", "#9dc3f7", "#7396c8", "#70819a", "#19325a", "#000001", "#441a91", "#a06eb9", "#cda4de", "#901f76", "#c8509b", "#ff9ecd", "#720012", "#f06d78", "#f4f4f4", "#969696", "#646464"],
    "Prismacolor Premier Select": [
        "#fffdd0", "#e8d3a7", "#fad675", "#fde047", "#fada5e", "#ffeb00", "#ffc30b", "#ffae42", "#f79f1f", "#e47200", 
        "#e54622", "#d82e3f", "#c8102e", "#9e1b32", "#8a1538", "#d10056", "#e4007c", "#ff69b4", "#f7cac9", "#e1c699", 
        "#c6a4a4", "#915c83", "#702963", "#4a192c", "#800080", "#5c2e91", "#483d8b", "#000080", "#0033a0", "#005a9c", 
        "#0076ce", "#00a3e0", "#41b6e6", "#87ceeb", "#00bce4", "#009ca6", "#008b8b", "#006400", "#228b22", "#32cd32", 
        "#7cfc00", "#adff2f", "#f5f5dc", "#d2b48c", "#c19a6b", "#8b4513", "#a0522d", "#d2691e", "#cd853f", "#654321", 
        "#3b2f2f", "#4b3621", "#1a1110", "#808080", "#a9a9a9", "#d3d3d3", "#c0c0c0", "#ffffff", "#000000", "#2f4f4f"
    ],
    "Tombow ABT Dual Brush Select": ["#ffcc99", "#ff9900", "#ffcc00", "#cc9900", "#ffff00", "#ffff66", "#cccc00", "#ffff99", "#99cc00", "#cccc33", "#ccff00", "#99ff00", "#336600", "#99cc33", "#006633", "#669933", "#99ff66", "#99cc99", "#66ffcc", "#339933", "#003300", "#336633", "#e6f2ff", "#00cc66", "#006600", "#339966", "#336699", "#00cc99", "#66ffff", "#3399ff", "#009999", "#00ffff", "#66ccff", "#00ccff", "#0099ff", "#b3d9ff", "#0000ff", "#cce6ff", "#0066ff", "#000099", "#0099cc", "#0033cc", "#e6ccff", "#3333ff", "#000066", "#003366", "#ccccff", "#6600cc", "#cc99ff", "#9966cc", "#660099", "#9900cc", "#cc66ff", "#660066", "#330033", "#cc0066", "#ffccff", "#ff66cc", "#ff0066", "#ff3399", "#cc0033", "#990033", "#ff99cc", "#cc6699", "#ffccdd", "#ff3366", "#cc0000", "#990066", "#ff6600", "#990000", "#ff0000", "#cc0000", "#ffccaa", "#ff3300", "#ff6633", "#663300", "#ff3333", "#cc3300", "#ff0000", "#ffcccc", "#ff9999", "#ff3300", "#ff6600", "#cc9966", "#cc6600", "#cc3300", "#663300", "#996633", "#ffcc00", "#ffeecc", "#ffcc66", "#ffcc33", "#ff9900", "#ffffff", "#000000", "#1a1a1a", "#333333", "#4d4d4d", "#666666", "#808080", "#999999", "#b3b3b3", "#cccccc", "#e6e6e6", "#f2f2f2", "#ffffff"],
    "Copic Ciao Mini Pop": ["#fffcd1", "#f6f1f3", "#e3e7f5", "#ecd0ad", "#edf6f2", "#eaeff2"],
    "Copic Classic Cool Grays": ["#ffffff", "#eaeaea", "#d9e1e5", "#b7c1c8", "#6d767c", "#231916", "#302724"],
    "Copic Violet & Lavender": ["#eeecf5", "#eee7f1", "#e9e3f0", "#c8c4df", "#bec4df", "#92a4ce", "#b08cb9", "#e0dcec", "#dce3f2", "#c4cde1"]
  },
  "Themes & Essentials": {
    "_source": "Basic Color Standards",
    "CMYK+W Basic": ["#ffffff", "#00ffff", "#ff00ff", "#ffff00", "#000000"],
    "1-Bit Noir Monochrome": ["#000000", "#ffffff"],
    "Matrix Green Terminal": ["#020b00", "#00ff41"],
    "RGB Pure Primary": ["#ff0000", "#00ff00", "#0000ff"]
  }
};
