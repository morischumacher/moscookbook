import { z } from 'zod';
import { CONVENTION_RULE, formatShape, shapeOf } from './ingredientShape';
import { GERMAN_VOICE } from './writingVoice';
import type { AiKey } from './aiImport';
import { scrub } from './secretBox';
import { coreName } from './ingredientMatch';
import { mirroredAmount } from './ingredientUnits';
import { sectionHeading, toStructuredIngredients, withHeadingRows, type StructuredIngredient } from './ingredientParts';
import type { Ingredient } from './recipe';

/**
 * A recipe in its second language.
 *
 * A recipe is written once, in whichever language it arrived in, and the site
 * is read in two. The translation is made by the AI **while the recipe is
 * being edited**, shown in the form, corrected there if need be, and saved
 * with it — so what a reader sees is text somebody looked at, not a machine
 * translation made on the fly for every visit (which would also cost money on
 * every visit).
 *
 * Amounts are translated too, and that is the part a plain translation gets
 * wrong: "2 tbsp" is "2 EL", "1 cup" is not a unit a German kitchen has a
 * measure for, and 350 °F is an oven setting nobody here can dial. So unlike
 * the proof-reader in aiPolish.ts, the numbers are *allowed* to change — what
 * is checked instead is the shape: the same ingredient lines in the same
 * order, headings where headings were.
 */

export const RECIPE_LANGUAGES = ['de', 'en'] as const;
export type RecipeLanguage = (typeof RECIPE_LANGUAGES)[number];

export function otherLanguage(language: RecipeLanguage): RecipeLanguage {
    return language === 'de' ? 'en' : 'de';
}

export function asLanguage(value: unknown): RecipeLanguage | null {
    return value === 'de' || value === 'en' ? value : null;
}

const editorRow = z.object({
    amount: z.string().trim().max(120).default(''),
    item: z.string().trim().max(200).default(''),
});

/** What the form sends and what is stored: the editor's rows, headings included. */
export const translationSchema = z.object({
    locale: z.enum(RECIPE_LANGUAGES),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(''),
    instructions: z.string().trim().max(50_000).default(''),
    /** The recipe's tips & notes, translated. */
    tips: z.string().trim().max(10_000).default(''),
    ingredients: z.array(editorRow).max(260).default([]),
    /** `sourceKey` of the original at the time it was translated. */
    source: z.string().max(64).default(''),
});

export type RecipeTranslationInput = z.infer<typeof translationSchema>;

export interface TranslatableRecipe {
    title: string;
    description: string;
    instructions: string;
    /** Tips & notes; absent and empty mean the same. */
    tips?: string;
    ingredients: Ingredient[];
}

/** The rows that carry something; an empty line in the editor is not one. */
function filled(rows: Ingredient[]): Ingredient[] {
    return rows
        .map((row) => ({ amount: row.amount.trim(), item: row.item.trim() }))
        .filter((row) => row.item !== '');
}

/**
 * A short fingerprint of the original, so the form can say "the recipe has
 * changed since it was translated". Not security, only change detection:
 * FNV-1a over the text the translation was made from.
 *
 * `keepCase`: the key as it was built before every name started with a
 * capital — what the translations made back then were stamped with.
 */
export function sourceKey(recipe: TranslatableRecipe, keepCase = false): string {
    const text = JSON.stringify([
        recipe.title.trim(),
        recipe.description.trim(),
        recipe.instructions.trim(),
        // As stored, not as typed: "Für den Teig:" comes back from the
        // database as "## Für den Teig", and that is not a change.
        toStructuredIngredients(recipe.ingredients, keepCase).map((row) => [row.section ?? '', row.raw, row.name]),
        // Only when there are any: every translation made before recipes had
        // tips would otherwise have turned stale on the day they arrived.
        ...((recipe.tips ?? '').trim() !== '' ? [(recipe.tips ?? '').trim()] : []),
    ]);

    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

const GERMAN_WORDS = new Set([
    'und', 'mit', 'die', 'der', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'in', 'im', 'auf', 'für',
    'von', 'zu', 'bis', 'minuten', 'etwas', 'dann', 'nach', 'unter', 'geben', 'lassen', 'ist', 'nicht',
    'el', 'tl', 'prise', 'zwiebel', 'salz', 'pfeffer', 'wasser', 'öl', 'kochen', 'braten',
]);
const ENGLISH_WORDS = new Set([
    'and', 'with', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'until', 'minutes', 'then', 'add',
    'into', 'over', 'let', 'is', 'not', 'tbsp', 'tsp', 'cup', 'cups', 'pinch', 'onion', 'salt',
    'pepper', 'water', 'oil', 'cook', 'stir', 'heat',
]);

/**
 * Which of the two a text is written in, by counting common words.
 *
 * Only a default for the form's language switch, which the person can
 * change — so a guess is enough, and a guess costs nothing. German wins a tie
 * because the cookbook is German first.
 */
export function guessLanguage(text: string): RecipeLanguage {
    let german = 0;
    let english = 0;
    for (const word of text.toLowerCase().split(/[^a-zäöüß]+/)) {
        if (GERMAN_WORDS.has(word)) german += 1;
        if (ENGLISH_WORDS.has(word)) english += 1;
    }
    if (/[äöüß]/i.test(text)) german += 2;
    return english > german ? 'en' : 'de';
}

const LANGUAGE_NAME: Record<RecipeLanguage, string> = { de: 'German', en: 'English' };

/**
 * The other languages a shared recipe arrives in, by their common words —
 * enough to say "this is Spanish, translate it" (the owner's wish: a recipe
 * that is neither German nor English comes into the cookbook in German).
 */
const FOREIGN: Record<string, { name: string; words: Set<string> }> = {
    es: { name: 'Spanish', words: new Set(['y', 'el', 'la', 'los', 'las', 'de', 'del', 'con', 'para', 'una', 'un', 'minutos', 'cucharada', 'cucharadas', 'cucharadita', 'sal', 'aceite', 'cebolla', 'ajo', 'agua', 'hasta', 'añadir', 'cocinar', 'que', 'en', 'al']) },
    fr: { name: 'French', words: new Set(['et', 'le', 'la', 'les', 'de', 'des', 'du', 'avec', 'pour', 'une', 'un', 'minutes', 'cuillère', 'cuillères', 'sel', 'huile', 'oignon', 'ail', 'eau', 'jusqu', 'ajouter', 'faire', 'cuire', 'dans', 'est', 'au', 'aux']) },
    it: { name: 'Italian', words: new Set(['e', 'il', 'la', 'le', 'di', 'del', 'della', 'con', 'per', 'una', 'un', 'minuti', 'cucchiaio', 'cucchiai', 'sale', 'olio', 'cipolla', 'aglio', 'acqua', 'fino', 'aggiungere', 'cuocere', 'nel', 'nella', 'al']) },
    pt: { name: 'Portuguese', words: new Set(['e', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'com', 'para', 'uma', 'um', 'minutos', 'colher', 'colheres', 'sal', 'azeite', 'cebola', 'alho', 'água', 'até', 'adicionar', 'cozinhar', 'no', 'na']) },
    nl: { name: 'Dutch', words: new Set(['en', 'de', 'het', 'een', 'met', 'voor', 'van', 'minuten', 'eetlepel', 'eetlepels', 'theelepel', 'zout', 'olie', 'ui', 'knoflook', 'water', 'tot', 'toevoegen', 'koken', 'in', 'op']) },
};

/**
 * A language that is neither German nor English, when the text plainly is
 * one: more of its common words than of German's or English's, and enough of
 * them to be sure. Null for German, English, or too little to tell.
 */
export function foreignLanguage(text: string): { code: string; name: string } | null {
    const words = text.toLowerCase().split(/[^a-zà-ÿœæ]+/).filter(Boolean);
    let german = 0;
    let english = 0;
    for (const word of words) {
        if (GERMAN_WORDS.has(word)) german += 1;
        if (ENGLISH_WORDS.has(word)) english += 1;
    }
    if (/[äöüß]/i.test(text)) german += 2;
    let best: { code: string; name: string; hits: number } | null = null;
    for (const [code, language] of Object.entries(FOREIGN)) {
        const hits = words.filter((word) => language.words.has(word)).length;
        if (!best || hits > best.hits) best = { code, name: language.name, hits };
    }
    if (!best || best.hits < 6 || best.hits <= Math.max(german, english) * 1.5) return null;
    return { code: best.code, name: best.name };
}

const UNIT_RULES: Record<RecipeLanguage, string> = {
    de: `Amounts, for a German kitchen:
- write units the German way: tbsp → EL, tsp → TL, pinch → Prise, clove → Zehe,
  bunch → Bund, can → Dose, handful → Handvoll, slice → Scheibe
- keep every quantity exactly as it is, and keep cup, oz, lb, fl oz and pint
  as they are: the page works out grams and millilitres itself (and cups
  from grams), so never convert or compute an amount
- temperatures in the method: °F → °C, rounded to 5 (350 °F → 180 °C)
- use a decimal comma (1,5) and keep fractions like 1/2 as they are`,
    en: `Amounts, for an English-speaking kitchen:
- write units the English way: EL → tbsp, TL → tsp, Prise → pinch, Zehe → clove,
  Bund → bunch, Dose → can, Handvoll → handful, Scheibe → slice, Stück → leave
  out or "piece"
- keep every quantity and unit as it is (g stays g, cups stay cups): the
  page converts between the two itself, so never convert or compute an amount
- use a decimal point (1.5) and keep fractions like 1/2 as they are`,
};

/** The cookbook's own names for ingredients, as a rule the translation follows. */
export function glossaryRule(glossary: Record<string, string>): string {
    const pairs = Object.entries(glossary).filter(([from, to]) => from.trim() && to.trim()).slice(0, 200);
    if (pairs.length === 0) return '';
    return `\n\nThe cookbook already names these ingredients so; use exactly these names in "item" (keep any preparation after them, e.g. ", fein gehackt"):\n${pairs.map(([from, to]) => `- ${from} → ${to}`).join('\n')}`;
}

export function translatePrompt(from: RecipeLanguage | string, to: RecipeLanguage): string {
    const fromName = LANGUAGE_NAME[from as RecipeLanguage] ?? FOREIGN[from]?.name ?? 'its language';
    return `You translate a recipe from ${fromName} into ${LANGUAGE_NAME[to]} for a personal cookbook.

You receive the recipe as JSON and return the translation as JSON of exactly the same shape:
{"title": "...", "description": "...", "ingredients": [{"amount": "...", "item": "..."}], "instructions": "...", "tips": "..."}

Rules:
- "ingredients" must have EXACTLY as many entries as the input, in the same order.
  One entry in, one entry out: never merge, split, add or drop a line.
- An entry whose item starts with "## " is a section heading: translate the
  heading and keep the "## " and the empty amount.
- "item" is the ingredient with its preparation ("Zwiebel, gewürfelt" → "onion, diced").
  Use the name a cook in the target language would use.
${CONVENTION_RULE}
- "amount" is only the quantity and unit.
${UNIT_RULES[to]}
${to === 'de' ? GERMAN_VOICE : '- English text uses the plain imperative ("Add the onions").'}
- "instructions": keep the markdown exactly as it is — the same numbered or
  bulleted list, one step for one step, the same line breaks and headings.
  Times stay as they are.
- "tips" are the cook's own tips and notes for the recipe: translate them like
  the instructions, keeping their markdown.
- Translate faithfully. Do not add, drop, explain or improve anything; do not
  add tips, notes or a heading of your own.
- An empty field stays empty.

Return ONLY the JSON, with no explanation and no code fences.`;
}

/**
 * The model's answer, checked against what was sent.
 *
 * Refused when the ingredient lines do not match one for one, or a heading
 * stopped being a heading: a list that lost a line is a recipe that lost an
 * ingredient, and nobody notices that in a translation they cannot read.
 */
export function readTranslation(
    answer: unknown,
    original: TranslatableRecipe,
    to: RecipeLanguage,
    source: string
): RecipeTranslationInput | null {
    const parsed = z
        .object({
            title: z.string(),
            description: z.string().default(''),
            instructions: z.string().default(''),
            tips: z.string().default(''),
            ingredients: z.array(z.object({ amount: z.string().default(''), item: z.string() })).default([]),
        })
        .safeParse(answer);

    if (!parsed.success) return null;

    const rows = filled(original.ingredients);
    const translated = parsed.data.ingredients.map((row) => ({ amount: row.amount.trim(), item: row.item.trim() }));

    if (translated.length !== rows.length) return null;
    if (parsed.data.title.trim() === '') return null;
    if (original.instructions.trim() !== '' && parsed.data.instructions.trim() === '') return null;
    const hasTips = (original.tips ?? '').trim() !== '';
    if (hasTips && parsed.data.tips.trim() === '') return null;

    for (let index = 0; index < rows.length; index += 1) {
        const wasHeading = sectionHeading(rows[index]) !== null;
        let row = translated[index];
        if (row.item === '') return null;
        // A heading in, a heading out: forgive a lost "## " rather than
        // turning a section title into an ingredient.
        if (wasHeading && sectionHeading(row) === null) row = { amount: '', item: `## ${row.item}` };
        translated[index] = row;
    }

    const result = translationSchema.safeParse({
        locale: to,
        title: parsed.data.title,
        description: original.description.trim() === '' ? '' : parsed.data.description,
        instructions: parsed.data.instructions,
        // Nothing to translate is nothing in the answer, whatever the model made up.
        tips: hasTips ? parsed.data.tips : '',
        ingredients: translated,
        source,
    });

    return result.success ? result.data : null;
}

/**
 * The cookbook's names put in, whatever the model wrote: a row whose
 * ingredient the list knows gets the list's name in the target language,
 * with the model's preparation and notes after it ("Frühlingszwiebeln, fein
 * geschnitten" → "spring onions, finely sliced") — never a word of its own.
 */
export function withGlossary<T extends { ingredients: Ingredient[]; locale?: string }>(translation: T, original: { ingredients: Ingredient[] }, glossary: Record<string, string>): T {
    const rows = filled(original.ingredients);
    return {
        ...translation,
        ingredients: translation.ingredients.map((row, index) => {
            const source = rows[index];
            if (!source || sectionHeading(source) !== null) return row;
            // The original's amount, in this language: the numbers are the same in both (lib/ingredientUnits).
            const amount = mirroredAmount(source.amount, row.amount, translation.locale === 'en' ? 'en' : 'de');
            const name = glossary[coreName(source.item)];
            return { ...row, amount, ...(name ? { item: formatShape({ ...shapeOf(row.item), base: name }) } : {}) };
        }),
    };
}

export type TranslateOutcome =
    | { ok: true; translation: RecipeTranslationInput }
    | { ok: false; reason: 'no-keys' | 'unusable' | 'error'; message: string };

/**
 * Through the same provider chain as the import and the proof-reader, so a
 * second key is a fallback here too.
 */
export async function translateRecipe(
    original: TranslatableRecipe,
    from: RecipeLanguage | string,
    keys: AiKey[],
    call: (key: AiKey, system: string, user: string) => Promise<string>,
    parse: (text: string) => unknown,
    /** The other of the two by default; German for a recipe in a third language. */
    target?: RecipeLanguage,
    /**
     * Ingredient names the cookbook already has in the target language
     * (lib/ingredientCatalog): "Frühlingszwiebeln" → "spring onions", so the
     * translation names an ingredient as every other recipe does.
     */
    glossary: Record<string, string> = {}
): Promise<TranslateOutcome> {
    if (keys.length === 0) return { ok: false, reason: 'no-keys', message: 'No AI key is configured.' };

    const to = target ?? otherLanguage(from as RecipeLanguage);
    const payload = JSON.stringify({
        title: original.title.trim(),
        description: original.description.trim(),
        ingredients: filled(original.ingredients),
        instructions: original.instructions.trim(),
        tips: (original.tips ?? '').trim(),
    });
    const source = sourceKey(original);
    const failures: string[] = [];

    for (const key of keys) {
        try {
            const answer = await call(key, translatePrompt(from, to) + glossaryRule(glossary), payload);
            const translation = readTranslation(parse(answer), original, to, source);
            if (translation) return { ok: true, translation: withGlossary(translation, original, glossary) };
            failures.push('an answer that did not match the recipe');
        } catch (error) {
            failures.push(scrub(error instanceof Error ? error.message : String(error), key.apiKey));
        }
    }

    return {
        ok: false,
        reason: failures.every((failure) => failure === 'an answer that did not match the recipe') ? 'unusable' : 'error',
        message: failures.join(' · ').slice(0, 300),
    };
}

export const translateRequestSchema = z.object({
    from: z.enum(RECIPE_LANGUAGES),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).default(''),
    instructions: z.string().trim().max(50_000).default(''),
    tips: z.string().trim().max(10_000).default(''),
    ingredients: z.array(editorRow).max(260).default([]),
});

/** A stored translation's ingredient column, read defensively: it is JSON. */
export function storedRows(value: unknown): Ingredient[] {
    const parsed = z.array(editorRow).safeParse(value);
    return parsed.success ? parsed.data : [];
}

export interface StoredTranslation {
    locale: string;
    title: string;
    description: string;
    instructions: string;
    tips?: string;
    ingredients: unknown;
    /** `sourceKey` of the original when it was translated; '' when unknown. */
    source?: string;
}

/**
 * The recipe as a reader of `locale` should see it: its translation when it
 * has one and was written in the other language, otherwise itself.
 *
 * Only the words change. The structured amounts are read again from the
 * translated lines, so scaling and the shopping list work in either language.
 */
export function inLanguage<
    T extends {
        title: string;
        description: string | null;
        instructions: string;
        tips?: string;
        ingredients: StructuredIngredient[];
        language?: string | null;
        translations?: StoredTranslation[];
    },
>(recipe: T, locale: string): T & { shownIn: RecipeLanguage | null; translated: boolean; stale: boolean } {
    const own = asLanguage(recipe.language ?? null);
    const translation = own === locale ? undefined : recipe.translations?.find((row) => row.locale === locale);

    if (!translation) return { ...recipe, shownIn: own, translated: false, stale: false };

    /*
     * Edited since it was translated: the page says so, rather than showing
     * last month's amounts as if they were today's. The key is built from the
     * stored rows exactly as the edit form builds it (withHeadingRows).
     */
    const stale =
        Boolean(translation.source) &&
        translation.source !==
            sourceKey({
                title: recipe.title,
                description: recipe.description ?? '',
                instructions: recipe.instructions,
                tips: recipe.tips,
                ingredients: withHeadingRows(
                    recipe.ingredients.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))
                ),
            });

    const ingredients = toStructuredIngredients(storedRows(translation.ingredients));

    return {
        ...recipe,
        title: translation.title,
        description: translation.description || null,
        instructions: translation.instructions || recipe.instructions,
        // Like the method: an older translation without them shows the original's.
        ...(recipe.tips !== undefined ? { tips: translation.tips || recipe.tips } : {}),
        // A translation that somehow lost its lines is worse than the original's
        // — and so is a stale one whose lines no longer match in number: a
        // line added to the original since was missing from the list, the
        // scaling and the shopping list. The original's lines then, in the
        // original's words.
        ingredients:
            ingredients.length > 0 && !(stale && ingredients.length !== recipe.ingredients.length) ? ingredients : recipe.ingredients,
        shownIn: asLanguage(translation.locale),
        translated: true,
        stale,
    };
}

/** The translation's words for the search columns: one search finds both. */
export function searchableTranslation(translation: RecipeTranslationInput | null | undefined) {
    if (!translation) return null;
    return {
        title: translation.title,
        text: [
            translation.description,
            translation.ingredients.filter((row) => sectionHeading(row) === null).map((row) => row.item).join(' '),
            translation.instructions,
        ].join(' '),
    };
}
