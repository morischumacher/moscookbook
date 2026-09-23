'use client';

import { useTranslations } from 'next-intl';
import { DIET_TAGS, PROTEIN_TAGS, TAG_ICONS, MAX_SPICINESS, dietFrom } from '@/lib/tags';
import { labelClass } from './formStyles';

/**
 * What is in it, and how hot: vegan or vegetarian, or which meat and fish;
 * and none to three chillies. Tags with fixed names underneath (lib/tags.ts),
 * so they filter and show their icon everywhere. Picking a meat or fish takes
 * vegan and vegetarian away, and the other way round — a recipe cannot be both.
 */
export default function DietPicker({
    tags,
    onTags,
    spiciness,
    onSpiciness,
    ingredientNames,
}: {
    tags: string[];
    onTags: (next: string[]) => void;
    spiciness: number;
    onSpiciness: (next: number) => void;
    ingredientNames: string[];
}) {
    const t = useTranslations('RecipeForm');
    const tTags = useTranslations('Tags');

    const toggle = (tag: string) => {
        if (tags.includes(tag)) return onTags(tags.filter((entry) => entry !== tag));
        const isDiet = (DIET_TAGS as readonly string[]).includes(tag);
        const others = tags.filter((entry) =>
            isDiet ? !(PROTEIN_TAGS as readonly string[]).includes(entry) : !(DIET_TAGS as readonly string[]).includes(entry)
        );
        onTags([...others, tag]);
    };

    const allowed = dietFrom(ingredientNames.filter(Boolean));
    const suggested = allowed.filter((tag) => !tags.includes(tag));
    // Ticked vegan with butter in it: said, not refused — the list of words
    // that give an ingredient away is a guess.
    const doubt = ingredientNames.some(Boolean) ? DIET_TAGS.filter((tag) => tags.includes(tag) && !allowed.includes(tag)) : [];

    const chip = (tag: string) => {
        const on = tags.includes(tag);
        return (
            <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tag)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors ${
                    on ? 'bg-ink text-page' : 'border border-control text-muted hover:border-ink hover:text-ink'
                }`}
            >
                <span aria-hidden="true">{TAG_ICONS[tag]}</span>
                {tTags(tag as 'vegan')}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <p className={labelClass}>{t('dietLabel')}</p>
                <div className="flex flex-wrap gap-2">{DIET_TAGS.map(chip)}</div>
                <div className="mt-2 flex flex-wrap gap-2">{PROTEIN_TAGS.map(chip)}</div>
                {doubt.length > 0 && (
                    <p className="mt-2 text-sm text-danger">{t('tagsDoubt', { tags: doubt.map((tag) => tTags(tag as 'vegan')).join(', ') })}</p>
                )}
                {suggested.length > 0 && (
                    <p className="mt-2 text-sm text-muted">
                        {t('dietSuggested', { diet: suggested.map((tag) => tTags(tag as 'vegan')).join(', ') })}
                    </p>
                )}
            </div>

            <div>
                <p id="spiciness-label" className={labelClass}>{t('spicinessLabel')}</p>
                <div role="radiogroup" aria-labelledby="spiciness-label" className="flex flex-wrap gap-2">
                    {Array.from({ length: MAX_SPICINESS + 1 }, (_, level) => (
                        <button
                            key={level}
                            type="button"
                            role="radio"
                            aria-checked={spiciness === level}
                            aria-label={t('spicinessLevel', { level })}
                            // The radio pattern: one tab stop for the group,
                            // arrow keys to move within it.
                            tabIndex={spiciness === level ? 0 : -1}
                            onKeyDown={(event) => {
                                const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
                                if (!step) return;
                                event.preventDefault();
                                const next = (level + step + MAX_SPICINESS + 1) % (MAX_SPICINESS + 1);
                                onSpiciness(next);
                                const group = event.currentTarget.parentElement;
                                requestAnimationFrame(() => (group?.children[next] as HTMLElement | undefined)?.focus());
                            }}
                            onClick={() => onSpiciness(level)}
                            className={`min-h-9 min-w-12 rounded-full px-3 text-sm transition-colors ${
                                spiciness === level ? 'bg-ink text-page' : 'border border-control text-muted hover:border-ink'
                            }`}
                        >
                            {level === 0 ? t('notSpicy') : '🌶️'.repeat(level)}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
