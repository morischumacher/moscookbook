'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';

type State = 'working' | 'done' | 'expired' | 'failed' | 'missing';

function Verifier() {
    const t = useTranslations('Auth');
    const router = useRouter();
    const token = useSearchParams().get('token') ?? '';
    const [state, setState] = useState<State>(token ? 'working' : 'missing');

    // React runs effects twice in development, and confirming twice would burn
    // the token and report it as already used. The ref makes the request once
    // per mounted page regardless.
    const started = useRef(false);

    useEffect(() => {
        if (!token || started.current) return;
        started.current = true;

        const run = async () => {
            try {
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });

                const data = await res.json();

                if (res.ok) {
                    setState('done');
                    // The banner asking for confirmation is rendered on the
                    // server, so the cached render has to be thrown away for it
                    // to disappear.
                    router.refresh();
                    return;
                }

                const reason = typeof data.reason === 'string' ? data.reason : '';
                setState(reason === 'expired' || reason === 'used' ? 'expired' : 'failed');
            } catch {
                setState('failed');
            }
        };

        void run();
    }, [token, router]);

    if (state === 'working') {
        return <p className="text-muted">{t('verifyWorking')}</p>;
    }

    if (state === 'done') {
        return (
            <div className="flex flex-col gap-6">
                <p className="rounded-lg border border-line p-4 text-sm leading-relaxed">
                    {t('verifyDone')}
                </p>
                <Link href="/" className="text-center text-sm underline underline-offset-4">
                    {t('toCookbook')}
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            <p className="rounded-lg border border-danger-line bg-danger-surface p-4 text-sm text-danger">
                {state === 'missing' ? t('linkMissing') : state === 'expired' ? t('linkExpired') : t('error')}
            </p>
            <Link href="/" className="text-center text-sm underline underline-offset-4">
                {t('toCookbook')}
            </Link>
        </div>
    );
}

export default function VerifyPage() {
    const t = useTranslations('Auth');

    return (
        <main className="container mx-auto max-w-sm px-4 pb-32 pt-16 sm:pt-24">
            <h1 className="mb-8 text-3xl font-extrabold tracking-tight">{t('verifyTitle')}</h1>
            <Suspense fallback={null}>
                <Verifier />
            </Suspense>
        </main>
    );
}
