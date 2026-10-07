import prisma from './prisma';
import type { Prisma } from '@prisma/client';
import { sectionHeading, withHeadingRows } from './ingredientParts';
import { sourceKey, storedRows, type RecipeLanguage } from './recipeTranslation';
import { unitKey, unitLabel } from './ingredientUnits';

/**
 * Once after a deploy: what migration 0067 left behind when it cleared the
 * amounts that were a unit with no number ("EL" for "EL Ingwer", written by
 * the form before a number was typed). In SQL it could not reach the
 * translations: their rows still say "tbsp" alone, and the key they were
 * stamped with was built from the "EL" that is gone, so they read as out of
 * date. Here each such row is emptied too, and a translation that was up to
 * date with the "EL" is up to date again.
 */
const FLAG = 'recipes.loneUnits';
const VERSION = '1';
let settled = false;

/** A unit with no number: "tbsp", "EL", "Zehe". */
const LONE_UNIT = /^(g|kg|ml|l|el|tl|zehe|zehen|bund|tbsp|tsp|clove|cloves|bunch)$/i;

export async function ensureLoneUnitsCleared(): Promise<void> {
    if (settled) return;
    const row = await prisma.appSetting.findUnique({ where: { key: FLAG }, select: { value: true } }).catch(() => null);
    if (row?.value === VERSION) {
        settled = true;
        return;
    }
    const running = /^running:(\d+)$/.exec(row?.value ?? '');
    if (running && Date.now() - Number(running[1]) < 10 * 60_000) return;
    const claim = `running:${Date.now()}`;
    const claimed = row
        ? (await prisma.appSetting.updateMany({ where: { key: FLAG, value: row.value }, data: { value: claim } })).count === 1
        : await prisma.appSetting
              .create({ data: { key: FLAG, value: claim } })
              .then(() => true)
              .catch(() => false);
    if (!claimed) return;

    await clearLoneUnits();
    await prisma.appSetting.update({ where: { key: FLAG }, data: { value: VERSION } });
    settled = true;
}

/** Every translation's lone units next to an emptied amount cleared. Returns how many translations changed. */
export async function clearLoneUnits(): Promise<number> {
    const recipes = await prisma.recipe.findMany({
        where: { translations: { some: {} } },
        select: {
            title: true,
            description: true,
            instructions: true,
            tips: true,
            language: true,
            ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true } },
            translations: { select: { id: true, ingredients: true, source: true } },
        },
    });
    let changed = 0;
    for (const recipe of recipes) {
        const language: RecipeLanguage = recipe.language === 'en' ? 'en' : 'de';
        const keyOf = (raws: string[], keepCase = false) =>
            sourceKey(
                {
                    title: recipe.title,
                    description: recipe.description ?? '',
                    instructions: recipe.instructions,
                    tips: recipe.tips,
                    ingredients: withHeadingRows(recipe.ingredients.map((row, index) => ({ amount: raws[index], item: row.name, section: row.section }))),
                },
                keepCase
            );
        const raws = recipe.ingredients.map((row) => row.raw);
        for (const translation of recipe.translations) {
            const stored = storedRows(translation.ingredients);
            // Paired row for row with the recipe's, as a translation is made from them; anything else is left alone.
            const filled = stored.map((row, index) => ({ row, index })).filter(({ row }) => sectionHeading(row) === null && row.item.trim() !== '');
            if (filled.length !== recipe.ingredients.length) continue;
            const next = [...stored];
            // What the recipe's amount was before it was emptied: the same unit in its language ("tbsp" → "EL").
            const before = [...raws];
            let touched = false;
            filled.forEach(({ row, index }, at) => {
                if (raws[at].trim() !== '' || !LONE_UNIT.test(row.amount.trim())) return;
                next[index] = { ...row, amount: '' };
                before[at] = unitLabel(unitKey(row.amount.trim()), language);
                touched = true;
            });
            if (!touched) continue;
            const wasFresh = Boolean(translation.source) && [keyOf(before), keyOf(before, true)].includes(translation.source);
            await prisma.recipeTranslation.update({
                where: { id: translation.id },
                data: { ingredients: next as unknown as Prisma.InputJsonValue, ...(wasFresh ? { source: keyOf(raws) } : {}) },
            });
            changed += 1;
        }
    }
    return changed;
}
