'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusyLabel } from '@/components/ui/Busy';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * A link — or a whole recipe's text — pasted straight into the inbox, for the
 * computer, where there is no share sheet. The same way in as a share from a
 * phone: it is read in the background and turns up in the list below.
 */
export default function InboxPaste({ onAdded }: { onAdded: () => void }) {
    const t = useTranslations('Inbox');
    const [value, setValue] = useState('');
    const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

    const add = async () => {
        // Enter pressed twice while the first one is still sending made two.
        if (state === 'busy') return;
        const pasted = value.trim();
        if (!pasted) return;
        setState('busy');
        try {
            const isLink = /^https?:\/\/\S+$/i.test(pasted);
            const res = await fetch('/api/capture/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(isLink ? { url: pasted } : { text: pasted }),
            });
            if (!res.ok) {
                setState('failed');
                return;
            }
            setValue('');
            setState('idle');
            onAdded();
        } catch {
            setState('failed');
        }
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                void add();
            }}
            className="mb-6"
        >
            <label htmlFor="inbox-paste" className="mb-2 block text-sm font-bold uppercase tracking-widest text-muted">
                {t('pasteLabel')}
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                {/* A text area, not a field: a recipe pasted from a mail
                    keeps its lines, which is what the parser reads. One line
                    tall until there is more than one line in it. */}
                <textarea
                    id="inbox-paste"
                    value={value}
                    rows={value.includes('\n') ? 6 : 1}
                    onChange={(event) => {
                        setValue(event.target.value);
                        if (state === 'failed') setState('idle');
                    }}
                    onKeyDown={(event) => {
                        // Enter adds a link; in a pasted recipe it is a new line.
                        if (event.key === 'Enter' && !event.shiftKey && !value.includes('\n')) {
                            event.preventDefault();
                            void add();
                        }
                    }}
                    placeholder={t('pastePlaceholder')}
                    autoComplete="off"
                    className="w-full min-w-0 resize-none rounded-2xl border border-control bg-transparent px-4 py-2 outline-none transition-colors focus:border-ink"
                />
                <button type="submit" disabled={state === 'busy' || !value.trim()} className={`${buttonPrimarySmall} shrink-0`}>
                    <BusyLabel busy={state === 'busy'}>{t('pasteAdd')}</BusyLabel>
                </button>
            </div>
            {state === 'failed' && (
                <p role="alert" className="mt-2 text-sm text-danger">
                    {t('pasteFailed')}
                </p>
            )}
        </form>
    );
}
