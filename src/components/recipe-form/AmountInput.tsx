'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UNIT_CHOICES, choiceFor, choiceLabel, joinFromEditor, splitForEditor, type AmountFields, type UnitChoice } from '@/lib/unitChoice';
import { fieldBase } from './formStyles';

/**
 * An ingredient's amount as a number and a unit from a fixed list, with
 * "Eigene …" for any other word (lib/unitChoice). Kept as the one text the
 * recipe stores; what an import wrote is matched to the list and can be
 * changed here.
 */
export default function AmountInput({
    amount,
    number,
    language,
    usual,
    onChange,
}: {
    amount: string;
    number: number;
    language?: 'de' | 'en';
    /** The ingredient's main unit ('g', 'tbsp'): chosen already while the amount is still empty. */
    usual?: string | null;
    onChange: (next: string) => void;
}) {
    const t = useTranslations('RecipeForm');
    // The recipe's language, not the page's: "2 tbsp" in an English recipe typed on the German page.
    const page = (useLocale() === 'en' ? 'en' : 'de') as 'de' | 'en';
    const locale = language ?? page;

    // The fields as typed — "1 " on the way to "1 1/2" — and started afresh
    // when the amount changes from outside (an import, a restored draft).
    const [fields, setFields] = useState<AmountFields>(() => splitForEditor(amount));
    const [seen, setSeen] = useState(amount);
    if (amount !== seen) {
        setSeen(amount);
        if (amount !== joinFromEditor(fields, locale)) setFields(splitForEditor(amount));
    }

    // The ingredient's usual unit, shown while nothing is typed: the number typed next is in it.
    const usualChoice = usual ? choiceFor(usual) : '';
    const choice = !fields.quantity.trim() && fields.choice === '' && usualChoice !== 'custom' ? usualChoice : fields.choice;

    const change = (next: Partial<AmountFields>) => {
        const merged = { ...fields, choice, ...next };
        setFields(merged);
        const joined = joinFromEditor(merged, locale);
        setSeen(joined);
        onChange(joined);
    };

    return (
        <>
            <input
                type="text"
                inputMode="decimal"
                value={fields.quantity}
                onChange={(event) => change({ quantity: event.target.value })}
                placeholder={t('quantityPlaceholder')}
                aria-label={t('amountLabel', { number })}
                className={fieldBase + ' w-20 shrink-0 px-2 text-center'}
            />
            <select
                value={choice}
                onChange={(event) => change({ choice: event.target.value as UnitChoice })}
                aria-label={t('unitLabel', { number })}
                className={fieldBase + ' w-24 shrink-0 px-1'}
            >
                {UNIT_CHOICES.map((choice) => (
                    <option key={choice} value={choice}>
                        {choice === '' ? t('unitNone') : choiceLabel(choice, locale)}
                    </option>
                ))}
                <option value="custom">{t('unitCustom')}</option>
            </select>
            {fields.choice === 'custom' && (
                // Its own line under the row, under the unit: the row has no
                // room left on a phone.
                <div className="order-last basis-full pl-[5.5rem]">
                    <input
                        type="text"
                        value={fields.custom}
                        onChange={(event) => change({ custom: event.target.value })}
                        placeholder={t('unitCustomPlaceholder')}
                        aria-label={t('unitCustomLabel', { number })}
                        className={fieldBase + ' w-44'}
                    />
                </div>
            )}
        </>
    );
}
