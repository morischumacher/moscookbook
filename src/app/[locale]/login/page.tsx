'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { destinationFrom } from '@/lib/loginDestination';
import { goAfterAuth } from '@/lib/afterAuth';
import { buttonPrimary } from '@/lib/ui';
import PasskeyLogin from '@/components/auth/PasskeyLogin';
import { forgetOfflineCopies } from '@/lib/offlineCopies';

const fieldClass =
    'w-full rounded-lg border border-control bg-transparent px-3 py-2 outline-none transition-colors focus:border-ink';
const labelClass = 'mb-2 block text-sm font-bold uppercase tracking-widest text-muted';

function LoginForm() {
    const t = useTranslations('Auth');
    const locale = useLocale();
    const next = useSearchParams().get('next');
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
                // A full load, not a client-side push: see src/lib/afterAuth.ts
                // for why the router left the login form on screen under a bar
                // that already said you were signed in.
                goAfterAuth(locale, destinationFrom(next, data.admin ? '/admin' : '/'));
                return;
            }

            // Said in the page's language: the server's words are English.
            setError(res.status === 401 ? t('wrongCredentials') : res.status === 429 ? t('tooMany') : t('failed'));
        } catch {
            setError(t('error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
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
                        // "webauthn": the browser may offer a saved passkey
                        // right in this field's suggestions.
                        autoComplete="username webauthn"
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
                    className={buttonPrimary}
                >
                    {t('submitLogin')}
                </button>

                <PasskeyLogin
                    onSignedIn={(admin) => goAfterAuth(locale, destinationFrom(next, admin ? '/admin' : '/'))}
                    onError={setError}
                />

                <p className="text-center text-sm">
                    <Link href="/forgot" className="text-muted underline underline-offset-4">
                        {t('forgotLink')}
                    </Link>
                </p>

                {/*
                    A sentence rather than a link, because the link was a
                    guaranteed dead end: /register without an ?invite= refuses
                    to draw the form, so the only thing on the far side of
                    "Register" was a message and a link back to here.

                    `inviteRequired` is the wording that page already uses.
                    Saying it here means the answer arrives before the detour
                    instead of after it.
                */}
                <p className="text-center text-sm text-muted">
                    {t('inviteRequired')}
                </p>
            </form>
        </>
    );
}

export default function LoginPage() {
    const t = useTranslations('Auth');

    // Whoever arrives here is not signed in — a session that expired or was
    // ended on another device included — so the pages kept for reading
    // offline go: on a shared tablet they are the last person's.
    useEffect(() => {
        void forgetOfflineCopies();
    }, []);

    return (
        <main className="container mx-auto px-4 sm:max-w-sm pb-32 pt-16 sm:pt-24">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{t('loginTitle')}</h1>
            {/* useSearchParams reads something only the browser knows, so the
                subtree has to be allowed to render later than the page. */}
            <Suspense fallback={null}>
                <LoginForm />
            </Suspense>
        </main>
    );
}
