'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { goAfterAuth } from '@/lib/afterAuth';
import { Link } from '@/i18n/routing';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

function ResetForm() {
    const t = useTranslations('Auth');
    const locale = useLocale();
    const token = useSearchParams().get('token') ?? '';

    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        // Checked here as well as on the server, because the mistake this
        // catches — a typo in a password nobody can see — is one the server
        // cannot catch at all.
        if (password !== confirmation) {
            setError(t('passwordMismatch'));
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (res.ok) {
                goAfterAuth(locale, data.admin ? '/admin' : '/');
                return;
            }

            // "expired" and "used" are worth naming: they tell the person to
            // ask for a new link rather than to doubt what they typed.
            const reason = typeof data.reason === 'string' ? data.reason : '';
            setError(
                reason === 'expired' || reason === 'used'
                    ? t('linkExpired')
                    : data.message || t('error')
            );
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="flex flex-col gap-6">
                <p className="rounded-lg border border-danger-line bg-danger-surface p-4 text-sm text-danger">
                    {t('linkMissing')}
                </p>
                <Link href="/forgot" className="text-center text-sm underline underline-offset-4">
                    {t('forgotTitle')}
                </Link>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {error && (
                <p className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                    {error}
                </p>
            )}

            <div>
                <label htmlFor="password" className={labelClass}>{t('newPassword')}</label>
                <input
                    type="password"
                    id="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    className={fieldClass}
                />
                <p className="mt-2 text-sm text-muted">{t('passwordHint')}</p>
            </div>

            <div>
                <label htmlFor="confirmation" className={labelClass}>{t('repeatPassword')}</label>
                <input
                    type="password"
                    id="confirmation"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                    minLength={8}
                    className={fieldClass}
                />
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="rounded-full bg-ink px-6 py-3 font-medium text-page disabled:opacity-50"
            >
                {t('resetSubmit')}
            </button>
        </form>
    );
}

export default function ResetPage() {
    const t = useTranslations('Auth');

    return (
        <main className="container mx-auto max-w-sm px-4 pb-32 pt-16 sm:pt-24">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{t('resetTitle')}</h1>
            {/* useSearchParams reads something only the browser knows, so the
                subtree has to be allowed to render later than the page. */}
            <Suspense fallback={null}>
                <ResetForm />
            </Suspense>
        </main>
    );
}
