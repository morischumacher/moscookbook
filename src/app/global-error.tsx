'use client';

import ErrorReporter from '@/components/ErrorReporter';

/**
 * The last resort: the root layout itself failed, so there is no layout, no
 * translations and no navigation to render inside.
 *
 * That means this file has to bring its own <html> and <body>, and the words
 * cannot come from the translation catalogue — the thing that loads them is
 * what broke. Both languages are shown rather than guessing wrong.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
    return (
        <html lang="de">
            <body
                style={{
                    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
                    background: '#FFF8F0',
                    color: '#111111',
                    margin: 0,
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    textAlign: 'center',
                }}
            >
                <ErrorReporter error={error} />

                <div>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
                        Da ist etwas kaputtgegangen.
                    </h1>
                    <p style={{ color: '#4B5563', marginBottom: '1.5rem' }}>
                        Something went wrong. Bitte lade die Seite neu.
                    </p>
                    {/*
                        A plain <a>, and the rule is switched off for this one
                        line with a reason rather than in general: next/link
                        navigates through the router, and this file only ever
                        renders because the root layout — and with it the
                        router — failed. A hard navigation is the only kind
                        that can work here.
                    */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/" style={{ color: '#C73500' }}>
                        mo&#39;scookbook
                    </a>
                </div>
            </body>
        </html>
    );
}
