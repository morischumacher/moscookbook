import { strFromU8, unzipSync, gunzipSync } from 'fflate';
import type { Ingredient } from './recipe';
import { parseIngredientLine, toMarkdownSteps } from './recipeParser';
import { isoDurationToMinutes, parseServings } from './amount';
import { normaliseTags } from './tags';

/**
 * Recipes from other apps: Paprika, Mealie, Tandoor, Cooklang, and a plain
 * schema.org Recipe JSON — so moving a collection in from somewhere else is
 * one file, not an evening of copying.
 *
 * Read in the browser (fflate works there): an export with photographs is
 * easily hundreds of megabytes, far past what one request to the server may
 * carry. What comes out is a list the admin looks at and picks from; the
 * chosen ones go to the server a few at a time and arrive as drafts.
 */

export interface ForeignRecipe {
    title: string;
    description: string;
    ingredients: Ingredient[];
    instructions: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    category: string;
    tags: string[];
    sourceUrl: string;
    image: { data: Uint8Array; type: string } | null;
    /** Where it came from, for the list: "Paprika", "Mealie"… */
    from: string;
}

/** "15 min", "1 hr 30 mins", "1 Std. 20 Min.", "PT1H30M", 45 → minutes. */
export function minutesFrom(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
    if (typeof value !== 'string' || !value.trim()) return null;
    const iso = isoDurationToMinutes(value.trim());
    if (iso !== null) return iso;

    const text = value.toLowerCase();
    const hours = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours|std|stunde|stunden)\b/.exec(text);
    const minutes = /(\d+)\s*(?:m|min|mins|minute|minutes|minuten)\b/.exec(text);
    const total = (hours ? Number(hours[1].replace(',', '.')) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
    if (total > 0) return Math.round(total);

    const bare = /^\s*(\d+)\s*$/.exec(text);
    return bare ? Number(bare[1]) : null;
}

function linesOf(text: unknown): string[] {
    return typeof text === 'string' ? text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
}

function ingredientsFromLines(lines: string[]): Ingredient[] {
    return lines.map(parseIngredientLine).filter((row) => row.item.trim() !== '');
}

function base64ToBytes(data: string): Uint8Array {
    const binary = atob(data.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

/* ----------------------------------------------------------------- Paprika */

/** One `.paprikarecipe`: gzip-compressed JSON. */
export function fromPaprika(json: Record<string, unknown>): ForeignRecipe | null {
    const title = typeof json.name === 'string' ? json.name.trim() : '';
    if (!title) return null;

    const notes = typeof json.notes === 'string' && json.notes.trim() ? `\n\n${json.notes.trim()}` : '';
    const categories = Array.isArray(json.categories) ? json.categories.filter((entry): entry is string => typeof entry === 'string') : [];

    return {
        title,
        description: typeof json.description === 'string' ? json.description.trim() : '',
        ingredients: ingredientsFromLines(linesOf(json.ingredients)),
        instructions: toMarkdownSteps([...linesOf(json.directions), ...(notes ? ['', notes.trim()] : [])]),
        servings: parseServings(json.servings),
        prepMinutes: minutesFrom(json.prep_time),
        cookMinutes: minutesFrom(json.cook_time),
        category: '',
        tags: normaliseTags(categories),
        sourceUrl: typeof json.source_url === 'string' ? json.source_url : '',
        image: typeof json.photo_data === 'string' && json.photo_data ? { data: base64ToBytes(json.photo_data), type: 'image/jpeg' } : null,
        from: 'Paprika',
    };
}

/* ------------------------------------------------------------------- Mealie */

interface MealieIngredient {
    note?: string;
    display?: string;
    originalText?: string;
    quantity?: number;
    unit?: { name?: string } | null;
    food?: { name?: string } | null;
}

export function fromMealie(json: Record<string, unknown>, image: ForeignRecipe['image'] = null): ForeignRecipe | null {
    const title = typeof json.name === 'string' ? json.name.trim() : '';
    if (!title) return null;

    const ingredients: Ingredient[] = (Array.isArray(json.recipeIngredient) ? json.recipeIngredient : []).flatMap(
        (entry: MealieIngredient | string) => {
            if (typeof entry === 'string') return [parseIngredientLine(entry)];
            // The structured fields when Mealie has them, its own text when not.
            if (entry.food?.name) {
                const amount = [entry.quantity ? String(entry.quantity) : '', entry.unit?.name ?? ''].filter(Boolean).join(' ');
                const item = [entry.food.name, entry.note].filter(Boolean).join(', ');
                return [{ amount, item }];
            }
            const text = entry.originalText || entry.display || entry.note || '';
            return text ? [parseIngredientLine(text)] : [];
        }
    ).filter((row) => row.item.trim() !== '');

    const steps = (Array.isArray(json.recipeInstructions) ? json.recipeInstructions : [])
        .map((step: { text?: string } | string) => (typeof step === 'string' ? step : step.text ?? ''))
        .filter(Boolean);

    const names = (list: unknown) =>
        Array.isArray(list) ? list.map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: string }).name ?? '')).filter(Boolean) : [];

    return {
        title,
        description: typeof json.description === 'string' ? json.description.trim() : '',
        ingredients,
        instructions: steps.map((step, index) => `${index + 1}. ${step.trim()}`).join('\n'),
        servings: parseServings(json.recipeServings ?? json.recipeYield),
        prepMinutes: minutesFrom(json.prepTime),
        cookMinutes: minutesFrom(json.performTime ?? json.cookTime),
        category: names(json.recipeCategory)[0] ?? '',
        tags: normaliseTags(names(json.tags)),
        sourceUrl: typeof json.orgURL === 'string' ? json.orgURL : typeof json.url === 'string' ? json.url : '',
        image,
        from: 'Mealie',
    };
}

/* ------------------------------------------------------------------ Tandoor */

interface TandoorStep {
    instruction?: string;
    ingredients?: { food?: { name?: string }; unit?: { name?: string } | null; amount?: number; note?: string; is_header?: boolean }[];
}

export function fromTandoor(json: Record<string, unknown>, image: ForeignRecipe['image'] = null): ForeignRecipe | null {
    const title = typeof json.name === 'string' ? json.name.trim() : '';
    if (!title) return null;

    const steps: TandoorStep[] = Array.isArray(json.steps) ? json.steps : [];
    const ingredients: Ingredient[] = steps.flatMap((step) =>
        (step.ingredients ?? []).flatMap((entry) => {
            if (entry.is_header) return entry.note ? [{ amount: '', item: `## ${entry.note}` }] : [];
            const name = entry.food?.name;
            if (!name) return [];
            const amount = [entry.amount ? String(entry.amount) : '', entry.unit?.name ?? ''].filter(Boolean).join(' ');
            return [{ amount, item: [name, entry.note].filter(Boolean).join(', ') }];
        })
    );

    const keywords = Array.isArray(json.keywords) ? json.keywords.map((entry: { name?: string }) => entry.name ?? '').filter(Boolean) : [];

    return {
        title,
        description: typeof json.description === 'string' ? json.description.trim() : '',
        ingredients,
        instructions: steps
            .map((step) => (step.instruction ?? '').trim())
            .filter(Boolean)
            .map((text, index) => `${index + 1}. ${text}`)
            .join('\n'),
        servings: parseServings(json.servings),
        prepMinutes: minutesFrom(json.working_time),
        cookMinutes: minutesFrom(json.waiting_time),
        category: '',
        tags: normaliseTags(keywords),
        sourceUrl: typeof json.source_url === 'string' ? json.source_url : '',
        image,
        from: 'Tandoor',
    };
}

/* ----------------------------------------------------------------- Cooklang */

/**
 * A `.cook` file: the method as text, with the ingredients marked where they
 * are used — `@Mehl{500%g}`, `@Salz`, `@rote Zwiebeln{2}` — cookware as
 * `#pan{}`, timers as `~{15%minutes}`, metadata as `>> servings: 4`.
 */
export function fromCooklang(text: string, filename: string): ForeignRecipe | null {
    const meta: Record<string, string> = {};
    const ingredients: Ingredient[] = [];
    const steps: string[] = [];

    const INGREDIENT = /@([^@#~{}\n]+?)\{([^}]*)\}|@([\p{L}\p{N}_-]+)/gu;
    const COOKWARE = /#([^@#~{}\n]+?)\{[^}]*\}|#([\p{L}\p{N}_-]+)/gu;
    const TIMER = /~[^{\s]*\{([^}]*)\}/g;

    const block = text.replace(/\[-[\s\S]*?-\]/g, '').split(/\r?\n\s*\r?\n/);
    for (const paragraph of block) {
        const lines: string[] = [];
        for (const raw of paragraph.split(/\r?\n/)) {
            const line = raw.replace(/--.*$/, '').trim();
            if (!line) continue;
            const metadata = /^>>\s*([^:]+):\s*(.*)$/.exec(line);
            if (metadata) {
                meta[metadata[1].trim().toLowerCase()] = metadata[2].trim();
                continue;
            }
            lines.push(line);
        }
        if (lines.length === 0) continue;

        const joined = lines.join(' ');
        for (const match of joined.matchAll(INGREDIENT)) {
            const name = (match[1] ?? match[3] ?? '').trim();
            const [quantity = '', unit = ''] = (match[2] ?? '').split('%');
            ingredients.push({ amount: [quantity.trim(), unit.trim()].filter(Boolean).join(' '), item: name });
        }

        steps.push(
            joined
                .replace(INGREDIENT, (_, multi: string | undefined, _amount: string | undefined, single: string | undefined) => (multi ?? single ?? '').trim())
                .replace(COOKWARE, (_, multi: string | undefined, single: string | undefined) => (multi ?? single ?? '').trim())
                .replace(TIMER, (_, time: string) => time.replace('%', ' '))
        );
    }

    const title = meta.title || filename.replace(/\.cook$/i, '').replace(/[-_]+/g, ' ').trim();
    if (!title || steps.length === 0) return null;

    return {
        title,
        description: meta.description ?? '',
        ingredients,
        instructions: steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
        servings: parseServings(meta.servings),
        prepMinutes: minutesFrom(meta['prep time'] ?? meta.prep),
        cookMinutes: minutesFrom(meta['cook time'] ?? meta.cook ?? meta.time),
        category: meta.course ?? '',
        tags: normaliseTags((meta.tags ?? '').split(',')),
        sourceUrl: meta.source ?? '',
        image: null,
        from: 'Cooklang',
    };
}

/* ----------------------------------------------------------------- the file */

function imageType(name: string): string {
    return /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg';
}

function parseJson(bytes: Uint8Array): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(strFromU8(bytes));
        return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** Whatever was chosen: an export archive, a single `.cook`, a JSON file. */
export function readForeignFile(name: string, bytes: Uint8Array): ForeignRecipe[] {
    const lower = name.toLowerCase();

    if (lower.endsWith('.cook')) return [fromCooklang(strFromU8(bytes), name)].filter((r): r is ForeignRecipe => r !== null);
    if (lower.endsWith('.paprikarecipe')) {
        const json = parseJson(gunzipSync(bytes));
        return json ? [fromPaprika(json)].filter((r): r is ForeignRecipe => r !== null) : [];
    }
    if (lower.endsWith('.json')) {
        const json = parseJson(bytes);
        if (!json) return [];
        const recipe = 'steps' in json ? fromTandoor(json) : fromMealie(json);
        return recipe ? [recipe] : [];
    }

    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch {
        return [];
    }
    const names = Object.keys(entries);
    const out: ForeignRecipe[] = [];

    for (const entry of names) {
        const file = entry.split('/').pop() ?? entry;
        if (file.endsWith('.paprikarecipe')) {
            const json = parseJson(gunzipSync(entries[entry]));
            const recipe = json ? fromPaprika(json) : null;
            if (recipe) out.push(recipe);
        } else if (file.endsWith('.cook')) {
            const recipe = fromCooklang(strFromU8(entries[entry]), file);
            if (recipe) out.push(recipe);
        } else if (file.endsWith('.zip')) {
            // Tandoor: one zip per recipe, a recipe.json and a picture inside.
            out.push(...readForeignFile(file, entries[entry]).map((recipe) => recipe));
        } else if (file === 'recipe.json') {
            const folder = entry.slice(0, entry.length - file.length);
            const picture = names.find((other) => other.startsWith(folder) && /^image\.(jpe?g|png|webp)$/i.test(other.slice(folder.length)));
            const json = parseJson(entries[entry]);
            const recipe = json ? fromTandoor(json, picture ? { data: entries[picture], type: imageType(picture) } : null) : null;
            if (recipe) out.push(recipe);
        } else if (/^recipes\/[^/]+\/[^/]+\.json$/.test(entry)) {
            // Mealie: recipes/<slug>/<slug>.json, pictures in images/ beside it.
            const folder = entry.slice(0, entry.lastIndexOf('/') + 1);
            const picture = names.find((other) => other.startsWith(`${folder}images/original.`));
            const json = parseJson(entries[entry]);
            const recipe = json ? fromMealie(json, picture ? { data: entries[picture], type: imageType(picture) } : null) : null;
            if (recipe) out.push(recipe);
        }
    }

    return out;
}
