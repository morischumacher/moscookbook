'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';

const fieldClass =
    'w-full rounded-lg border border-line bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

export default function LoginPage() {
    const t = useTranslations('Auth');
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (res.ok) {
                // The locale-aware router adds the language prefix itself, so
                // the destination is written plainly. refresh() throws away the
                // cached server render so the new session is picked up.
                router.push(data.admin ? '/admin' : '/');
                router.refresh();
                return;
            }

            setError(data.message || t('failed'));
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="container mx-auto max-w-sm px-4 pb-32 pt-16 sm:pt-24">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{t('loginTitle')}</h1>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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

                <div>
                    <label htmlFor="password" className={labelClass}>{t('password')}</label>
                    <input
                        type="password"
                        id="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        className={fieldClass}
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-full bg-ink px-6 py-3 font-medium text-page disabled:opacity-50"
                >
                    {t('submitLogin')}
                </button>

                <p className="text-center text-sm text-muted">
                    {t('needAccount')}{' '}
                    <Link href="/register" className="underline underline-offset-4">
                        {t('registerLink')}
                    </Link>
                </p>
            </form>
        </main>
    );
}
