'use client';

import { useState } from 'react';
import { sayable } from '@/lib/apiMessage';
import { useTranslations } from 'next-intl';
import { buttonPrimarySmall } from '@/lib/ui';

/**
 * The two AI buttons that act on text somebody has already written.
 *
 * **The suggestion is shown, never applied.** That is the entire design, and
 * it is not caution for its own sake: a proof-reader that edits in place is a
 * proof-reader you have to diff against your own memory, and the failure —
 * "Zwiebel" quietly becoming "Zwiebeln", a step tightened into saying
 * something slightly different — is invisible at exactly the moment it
 * matters. So the old text stays where it is, the new text appears below it,
 * and applying is a second press.
 *
 * The number check lives on the server (see lib/aiPolish.ts) because it has to
 * be true whatever calls this. What is here is only the saying-so: a
 * suggestion that moved a temperature is refused, and the screen says that
 * rather than showing nothing.
 */
export default function PolishPanel({
    text,
    onApply,
    modes = ['spelling', 'steps'],
    disabled = false,
    available = true,
}: {
    text: string;
    onApply: (next: string) => void;
    /** `steps` only makes sense for a method. A title gets spelling alone. */
    modes?: ('spelling' | 'steps')[];
    disabled?: boolean;
    /**
     * False when no key is configured, or the AI is switched off entirely.
     *
     * The buttons are still drawn, greyed and inert, with a line underneath
     * saying where to turn it on. Hiding them was the first version and it was
     * worse: a feature that is invisible until it is configured cannot be
     * discovered by the person who would configure it. A disabled control
     * answers "can this thing do that?" — an absent one does not.
     */
    available?: boolean;
}) {
    const t = useTranslations('Ai');

    const [busy, setBusy] = useState<string>('');
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [note, setNote] = useState('');

    const run = async (mode: 'spelling' | 'steps') => {
        setBusy(mode);
        setNote('');
        setSuggestion(null);

        try {
            const res = await fetch('/api/ai/polish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode, text }),
            });

            const data = await res.json().catch(() => ({}));

            if (res.status === 501) {
                setNote(t('polishOff'));
                return;
            }

            if (!res.ok) {
                setNote(sayable(data.message, t('polishFailed')));
                return;
            }

            if (data.ok === false) {
                setNote(t('polishNumbers'));
                return;
            }

            if (data.unchanged) {
                setNote(t('polishUnchanged'));
                return;
            }

            setSuggestion(data.text);
        } catch {
            setNote(t('polishOff'));
        } finally {
            setBusy('');
        }
    };

    const empty = text.trim().length === 0;

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="text-xs uppercase tracking-widest text-faint">
                    {t('polishHeading')}
                </span>

                {modes.map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => run(mode)}
                        disabled={disabled || empty || busy !== '' || !available}
                        className="text-sm underline underline-offset-4 disabled:text-faint disabled:no-underline"
                    >
                        {busy === mode
                            ? t('polishBusy')
                            : mode === 'spelling'
                                ? t('polishSpelling')
                                : t('polishSteps')}
                    </button>
                ))}
            </div>

            {!available && <p className="mt-2 text-sm text-faint">{t('polishOff')}</p>}

            {note && <p className="mt-2 text-sm text-muted">{note}</p>}

            {suggestion !== null && (
                <div className="mt-3 rounded-lg border border-line p-3">
                    <p className="mb-2 text-sm text-muted">{t('polishPreview')}</p>

                    {/* The suggestion as text, not in a box that looks like an
                        input: nothing here is editable, and a field somebody
                        can type into implies the typing goes somewhere. */}
                    <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">
                        {suggestion}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-4">
                        <button
                            type="button"
                            onClick={() => {
                                onApply(suggestion);
                                setSuggestion(null);
                            }}
                            className={buttonPrimarySmall}
                        >
                            {t('polishApply')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setSuggestion(null)}
                            className="text-sm text-faint underline underline-offset-4"
                        >
                            {t('polishDiscard')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
