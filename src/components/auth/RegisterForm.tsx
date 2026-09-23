'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { goAfterAuth } from '@/lib/afterAuth';
import { Link } from '@/i18n/routing';
import { buttonPrimary } from '@/lib/ui';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

/**
 * Making an account from an invitation.
 *
 * Rendered only once the invitation has been checked — see the page beside
 * this file. It keeps its own error handling: an invitation can be claimed in
 * another tab between this page loading and the button being pressed, and the
 * server is what decides.
 */
export default function RegisterForm({ invite }: { invite: string }) {
    const t = useTranslations('Auth');
    const locale = useLocale();
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        // The same check as the reset form: a typo in a password nobody can
        // see is an account nobody can open.
        if (password !== confirmation) {
            setError(t('passwordMismatch'));
            return;
        }
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firstName, lastName, email, password, invite, locale }),
            });

            if (res.ok) {
                // A full load, not a client navigation: see afterAuth.ts.
                goAfterAuth(locale, '/');
                return;
            }

            const data = await res.json();
            setError(data.message || t('registerFailed'));
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {error && (
                    <p className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                {/* Side by side once there is room; stacked on a phone, where
                    two half-width fields are two half-width mistakes. */}
                <div className="flex flex-col gap-6 sm:flex-row sm:gap-4">
                    <div className="flex-1">
                        <label htmlFor="firstName" className={labelClass}>{t('firstName')}</label>
                        <input
                            type="text"
                            id="firstName"
                            autoComplete="given-name"
                            value={firstName}
                            onChange={(event) => setFirstName(event.target.value)}
                            required
                            className={fieldClass}
                        />
                    </div>

                    <div className="flex-1">
                        <label htmlFor="lastName" className={labelClass}>{t('lastName')}</label>
                        <input
                            type="text"
                            id="lastName"
                            autoComplete="family-name"
                            value={lastName}
                            onChange={(event) => setLastName(event.target.value)}
                            required
                            className={fieldClass}
                        />
                    </div>
                </div>

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

                <div>
                    <label htmlFor="password" className={labelClass}>{t('password')}</label>
                    <input
                        type="password"
                        id="password"
                        autoComplete="new-password"
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
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
                        minLength={8}
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        required
                        className={fieldClass}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className={buttonPrimary}
                >
                    {isLoading ? t('creatingAccount') : t('submitRegister')}
                </button>

                <p className="text-center text-sm text-muted">
                    {t('haveAccount')}{' '}
                    <Link href="/login" className="underline underline-offset-4">
                        {t('loginLink')}
                    </Link>
                </p>
            </form>
    );
}
