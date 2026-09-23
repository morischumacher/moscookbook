'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { buttonPrimary } from '@/lib/ui';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

/**
 * The success message is the same whether or not the address exists, matching
 * what the endpoint does. Saying "we have sent you a mail" when nothing was
 * sent feels like a lie; the wording is therefore about what *will* happen —
 * "if there is an account for this address" — which is true in both cases.
 */
export default function ForgotPage() {
    const t = useTranslations('Auth');
    const locale = useLocale();
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await fetch('/api/auth/forgot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, locale }),
            });
            setSent(true);
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="container mx-auto px-4 sm:max-w-sm pb-32 pt-16 sm:pt-24">
            <h1 className="mb-4 text-3xl font-extrabold tracking-tight">{t('forgotTitle')}</h1>

            {sent ? (
                <div className="flex flex-col gap-6">
                    <p className="rounded-lg border border-line p-4 text-sm leading-relaxed">
                        {t('forgotSent')}
                    </p>
                    <Link href="/login" className="text-center text-sm underline underline-offset-4">
                        {t('backToLogin')}
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                    <p className="text-sm leading-relaxed text-muted">{t('forgotIntro')}</p>

                    {error && (
                        <p className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                            {error}
                        </p>
                    )}

                    <div>
                        <label htmlFor="email" className={labelClass}>{t('email')}</label>
                        <input
                            type="email"
                            id="email"
                            autoComplete="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            className={fieldClass}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className={buttonPrimary}
                    >
                        {t('forgotSubmit')}
                    </button>

                    <Link href="/login" className="text-center text-sm underline underline-offset-4">
                        {t('backToLogin')}
                    </Link>
                </form>
            )}
        </main>
    );
}
