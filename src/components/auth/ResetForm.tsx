'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { goAfterAuth } from '@/lib/afterAuth';
import { buttonPrimary } from '@/lib/ui';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

/**
 * Choosing the new password.
 *
 * Rendered only when the link has already been checked — see the page beside
 * this file. It keeps its own error handling all the same: the check happened
 * a moment ago and the link can expire, or be spent in another tab, between
 * the page loading and the button being pressed. The server is still the one
 * that decides.
 */
export default function ResetForm({ token }: { token: string }) {
    const t = useTranslations('Auth');
    const locale = useLocale();

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
                reason === 'expired' || reason === 'used' || reason === 'invalid' || reason === 'unknown'
                    ? t('linkExpired')
                    : res.status === 429
                      ? t('tooMany')
                      : res.status === 400
                        ? t('passwordHint')
                        : t('error')
            );
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            {error && (
                <p role="alert" className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
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
                    maxLength={200}
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
                    maxLength={200}
                    className={fieldClass}
                />
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className={buttonPrimary}
            >
                {t('resetSubmit')}
            </button>
        </form>
    );
}
