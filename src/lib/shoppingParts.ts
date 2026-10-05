/**
 * How much of a shopping line is for which recipe, and turning one
 * ingredient's lines in different units into one line in the unit it is
 * bought in.
 *
 * A line keeps its parts — `[{ s: "Agedashi Tofu", a: 2 }, { s: "Chili-Öl",
 * a: 1 }]` in the line's own unit — so taking a recipe off the list takes off
 * exactly its share, also after lines were merged or converted, and without
 * asking anybody. A line from before parts were kept has none, and is treated
 * as it always was.
 *
 * Units are converted with each ingredient's own factors: the unit it is
 * bought in (`buy`, a shopping measure: "mass", "volume", "count:",
 * "count:bund" …) and how much of it one of each other unit is ("count:" →
 * 1/7 for spring onions: seven make a bunch). They come from the defaults
 * below, from an AI asked once by the admin, or from admin → Zutaten.
 */

export interface Part {
    /** The recipe, or null for a line typed by hand. */
    s: string | null;
    /** In the line's unit; null when the line has no amount. */
    a: number | null;
}

export interface Units {
    buy: string;
    /** measure → how much of `buy` one of it is. */
    factors: Record<string, number>;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The parts a line is made of; a line from before them, as one part per recipe with no amount. */
export function partsOf(line: { parts?: unknown; sources: string[]; amount: number | null }): Part[] {
    if (Array.isArray(line.parts) && line.parts.length > 0) {
        return (line.parts as Part[]).filter((part) => part && typeof part === 'object').map((part) => ({ s: part.s ?? null, a: typeof part.a === 'number' ? part.a : null }));
    }
    if (line.sources.length === 0) return [{ s: null, a: line.amount }];
    // Legacy: the amounts per recipe are unknown. Only one recipe? Then it is all its.
    return line.sources.length === 1 ? [{ s: line.sources[0], a: line.amount }] : line.sources.map((s) => ({ s, a: null }));
}

/** One more part, summed with the same recipe's. */
export function withPart(parts: Part[], part: Part): Part[] {
    const at = parts.findIndex((other) => other.s === part.s);
    if (at === -1) return [...parts, part];
    const next = [...parts];
    const old = next[at];
    next[at] = { s: old.s, a: old.a === null && part.a === null ? null : round((old.a ?? 0) + (part.a ?? 0)) };
    return next;
}

/** The amount the parts add up to; null when none of them has one. */
export function totalOf(parts: Part[]): number | null {
    const known = parts.filter((part) => part.a !== null);
    return known.length === 0 ? null : round(known.reduce((sum, part) => sum + (part.a ?? 0), 0));
}

/**
 * A recipe's share taken off a line. Its amount goes with it when it is
 * known; a line from before parts keeps its amount (a little too much in the
 * trolley beats too little). `gone` when nothing is left for anybody.
 */
export function withoutSource(line: { measure?: string | null; amount: number | null; sources: string[]; parts?: unknown }, source: string): { gone: boolean; amount: number | null; sources: string[]; parts: Part[] } {
    const parts = partsOf(line);
    const mine = parts.filter((part) => part.s === source);
    const rest = parts.filter((part) => part.s !== source);
    const sources = line.sources.filter((other) => other !== source);
    const known = mine.every((part) => part.a !== null) && mine.length > 0;
    let amount = line.amount;
    if (known && amount !== null) amount = settled(line.measure ?? null, round(amount - mine.reduce((sum, part) => sum + (part.a ?? 0), 0)), rest);
    const gone = rest.length === 0 || (amount !== null && amount <= 0.0001 && rest.every((part) => part.a !== null));
    return { gone, amount, sources, parts: rest };
}

/** A line in another unit: its amount and every part times the factor. */
export function converted(line: { measure: string | null; amount: number | null; parts: Part[] }, units: Units): { measure: string; amount: number | null; parts: Part[] } | null {
    if (line.measure === units.buy) return { measure: units.buy, amount: line.amount, parts: line.parts };
    // "Ingwer" with no amount beside "150 g Ingwer": the recipe is kept, nothing added.
    if (line.measure === null && line.amount === null) return { measure: units.buy, amount: null, parts: line.parts.map((part) => ({ s: part.s, a: null })) };
    const factor = line.measure ? units.factors[line.measure] : undefined;
    if (!factor || !(factor > 0)) return null;
    return {
        measure: units.buy,
        amount: line.amount === null ? null : round(line.amount * factor),
        parts: line.parts.map((part) => ({ s: part.s, a: part.a === null ? null : round(part.a * factor) })),
    };
}

/**
 * An ingredient's lines in different units, as one in the unit it is bought
 * in — or null when one of them has no factor (nothing is half done).
 */
export function simplified(lines: { id: number; measure: string | null; amount: number | null; sources: string[]; parts: Part[] }[], units: Units) {
    const all = lines.map((line) => converted(line, units));
    if (all.some((line) => line === null)) return null;
    let parts: Part[] = [];
    for (const line of all) for (const part of line!.parts) parts = withPart(parts, part);
    const amounts = all.map((line) => line!.amount);
    const sum = amounts.every((value) => value === null) ? null : round(amounts.reduce<number>((total, value) => total + (value ?? 0), 0));
    // From the shares when every one is known, so adding again and again does not round up again and again.
    const exact = parts.length > 0 && parts.every((part) => part.a !== null) ? totalOf(parts) : sum;
    const amount = exact === null ? null : buyable(units.buy, exact);
    const sources = [...new Set(lines.flatMap((line) => line.sources))];
    const [keep, ...drop] = lines;
    return { keep: keep.id, drop: drop.map((line) => line.id), measure: units.buy, amount, parts, sources };
}

/**
 * An amount as it is bought: things counted up to the next half — "1½ Bund",
 * not "1,29 Bund" — and grams and millilitres to the next whole one.
 * The parts keep their exact shares; the line may hold a little more.
 */
export function buyable(measure: string, amount: number): number {
    if (measure.startsWith('count:')) return Math.max(0.5, Math.ceil(amount * 2 - 0.05) / 2);
    if (measure === 'mass' || measure === 'volume') return Math.ceil(amount - 0.05);
    return round(amount);
}

/**
 * A line's amount after a share came off: a line that was rounded up to buy
 * ("2½ Bund" for 2,43) rounded again from what is left, so "2,07 Bund" does
 * not stay behind; any other line as it is.
 */
export function settled(measure: string | null, amount: number, parts: Part[]): number {
    const total = parts.length > 0 && parts.every((part) => part.a !== null) ? totalOf(parts) : null;
    if (total === null || measure === null || Math.abs(total - amount) < 0.0001 || total <= 0) return amount;
    return Math.min(amount, buyable(measure, total));
}

/** A part taken off: the recipe's share less `amount`, gone when nothing is left of it. */
export function lessPart(parts: Part[], source: string | null, amount: number | null): Part[] {
    return parts.flatMap((part) => {
        if (part.s !== source) return [part];
        if (part.a === null || amount === null) return [];
        const left = round(part.a - amount);
        return left > 0.0001 ? [{ s: part.s, a: left }] : [];
    });
}

/** The units an ingredient is bought in: its own, else the defaults for a common one, else none. */
export function unitsOf(item: { buyMeasure: string | null; factors: unknown }, commonId: string | null): Units | null {
    const fallback = commonId ? DEFAULT_UNITS[commonId] : undefined;
    const own = item.factors && typeof item.factors === 'object' && !Array.isArray(item.factors) ? (item.factors as Record<string, unknown>) : {};
    const factors = Object.fromEntries(Object.entries(own).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0 && Number.isFinite(entry[1])));
    if (item.buyMeasure) {
        // Its own buy unit; the defaults only fill in when they are for the same one.
        return { buy: item.buyMeasure, factors: fallback && fallback.buy === item.buyMeasure ? { ...fallback.factors, ...factors } : factors };
    }
    return fallback ?? null;
}

/** A shopping measure the list knows: "mass", "volume", "spoon", or "count:" and a unit word. */
export function isMeasure(value: string): boolean {
    return value === 'mass' || value === 'volume' || value === 'spoon' || /^count:[a-zäöüß]{0,20}$/.test(value);
}

/**
 * What the common ingredients are bought in, and what one of their other
 * units is in it — so the usual cases work with no AI at all. Keyed by the
 * common list's ids (lib/ingredientNames). Rough on purpose: a shopping list
 * wants "1 Bund", not "0,86 Bund", and a little too much is fine.
 */
export const DEFAULT_UNITS: Record<string, Units> = {
    'spring-onion': { buy: 'count:bund', factors: { 'count:': 1 / 7, 'count:stange': 1 / 7, mass: 1 / 100 } },
    ginger: { buy: 'mass', factors: { spoon: 6 / 15, 'count:': 30, 'count:scheibe': 3 } },
    garlic: { buy: 'count:zehe', factors: { 'count:': 1, 'count:knolle': 10, mass: 1 / 5, spoon: 1 / 5 } },
    onion: { buy: 'count:', factors: { mass: 1 / 150 } },
    'red-onion': { buy: 'count:', factors: { mass: 1 / 150 } },
    shallot: { buy: 'count:', factors: { mass: 1 / 30 } },
    lemon: { buy: 'count:', factors: { volume: 1 / 40, spoon: 1 / 40 } },
    lime: { buy: 'count:', factors: { volume: 1 / 30, spoon: 1 / 30 } },
    butter: { buy: 'mass', factors: { spoon: 14 / 15 } },
    flour: { buy: 'mass', factors: { spoon: 8 / 15, volume: 125 / 240 } },
    sugar: { buy: 'mass', factors: { spoon: 12.5 / 15, volume: 200 / 240 } },
    parsley: { buy: 'count:bund', factors: { mass: 1 / 30, spoon: 1 / 60, 'count:handvoll': 1 / 2 } },
    coriander: { buy: 'count:bund', factors: { mass: 1 / 30, spoon: 1 / 60, 'count:handvoll': 1 / 2 } },
    basil: { buy: 'count:bund', factors: { mass: 1 / 30, spoon: 1 / 60, 'count:handvoll': 1 / 2 } },
    chives: { buy: 'count:bund', factors: { mass: 1 / 30, spoon: 1 / 60 } },
    dill: { buy: 'count:bund', factors: { mass: 1 / 30, spoon: 1 / 60 } },
    egg: { buy: 'count:', factors: { mass: 1 / 55 } },
    tomato: { buy: 'count:', factors: { mass: 1 / 100 } },
    carrot: { buy: 'count:', factors: { mass: 1 / 80 } },
    potato: { buy: 'mass', factors: { 'count:': 150 } },
};
