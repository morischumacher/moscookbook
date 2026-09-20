'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const fieldClass =
    'w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

export default function RegisterPage() {
    const t = useTranslations('Auth');
    const searchParams = useSearchParams();
    const invite = searchParams.get('invite') ?? '';
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, invite }),
            });

            if (res.ok) {
                // Full reload so every server component sees the new session.
                window.location.href = '/';
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
        <main className="container mx-auto max-w-sm px-4 pb-32 pt-16 sm:pt-24">
            <h1 className="mb-3 text-3xl font-extrabold tracking-tight">{t('registerTitle')}</h1>
            <p className="mb-8 font-serif text-muted">{t('registerIntro')}</p>

            {!invite ? (
                <div className="rounded-lg border border-line p-4">
                    <p className="text-muted">{t('inviteRequired')}</p>
                    <Link href="/login" className="mt-4 inline-block text-sm underline underline-offset-4">
                        {t('loginLink')}
                    </Link>
                </div>
            ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                {error && (
                    <p className="rounded-lg border border-danger-line bg-danger-surface p-3 text-sm text-danger">
                        {error}
                    </p>
                )}

                <div>
                    <label htmlFor="name" className={labelClass}>{t('name')}</label>
                    <input
                        type="text"
                        id="name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        className={fieldClass}
                    />
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

                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-full bg-ink px-6 py-3 font-medium text-page disabled:opacity-50"
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
            )}
        </main>
    );
}
