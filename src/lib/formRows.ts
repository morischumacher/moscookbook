import { conventionalRows } from './ingredientShape';
import { formatAmount, sectionHeading, splitAmount } from './ingredientParts';
import { isEuropean, unitKey } from './ingredientUnits';
import { toMetric } from './units';

/**
 * Rows as the form shows them, wherever they come from — an inbox draft, the
 * form's own import, a translation, the archive: each ingredient written the
 * cookbook's one way ("minced garlic" → "Garlic, minced", lib/ingredientShape)
 * and every amount in European units ("4 oz" → "113 g", lib/units toMetric).
 * Both by rules, no AI: what the AI got wrong in a row is put right here,
 * before anybody has to. Headings stay as they are; safe to run twice.
 */
export function formReadyRows<T extends { amount: string; item: string }>(rows: T[], language: 'de' | 'en'): T[] {
    return conventionalRows(rows).map((row) => {
        if (sectionHeading(row) !== null) return row;
        const parts = splitAmount(row.amount);
        if (parts.quantity === null || !parts.unit || isEuropean(unitKey(parts.unit))) return row;
        const metric = toMetric(parts, row.item, language);
        return metric.unit !== parts.unit ? { ...row, amount: formatAmount(metric, 1, language) } : row;
    });
}
