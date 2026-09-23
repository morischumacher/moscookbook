import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { publicClientMessages } from '@/i18n/clientMessages';
import { getSiteUrl } from '@/lib/siteUrl';
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VerifyBanner from "@/components/auth/VerifyBanner";
import ServiceWorker from "@/components/ServiceWorker";
import NavigationProgress from "@/components/ui/NavigationProgress";
import GlobalErrorReporter from "@/components/GlobalErrorReporter";
import "../globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    // Only the admin form uses it; preloading it would cost every visitor a
    // font fetch they never see the result of.
    preload: false,
});

/**
 * No maximum-scale and no user-scalable=no: pinching to zoom is how people
 * read a recipe on a phone, and blocking it is an accessibility failure.
 * themeColor tints the browser chrome to match the page in both schemes.
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#FFF8F0' },
        { media: '(prefers-color-scheme: dark)', color: '#000000' },
    ],
};

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Site' });

    return {
        // Lets page-level openGraph images use relative URLs.
        metadataBase: new URL(getSiteUrl()),
        title: { default: t('title'), template: '%s' },
        description: t('description'),

        /*
         * The preview card every link gets when it is pasted somewhere.
         *
         * Only the two shared routes set this before — /r/[token] and
         * /p/[token] — so every other address on the site travelled as a bare
         * line of text. The one that mattered most was the invitation: you
         * send somebody `…/register?invite=…`, and what arrives in their chat
         * is a title with nothing beside it, which reads like a link somebody
         * pasted by accident rather than an invitation to a cookbook.
         *
         * Set here, so anything without its own card inherits one. The two
         * shared routes still override it with the photograph of the dish,
         * which is the better picture when there is one.
         */
        openGraph: {
            type: 'website',
            siteName: t('title'),
            title: t('title'),
            description: t('description'),
            locale: locale === 'de' ? 'de_DE' : 'en_US',
            images: [{ url: '/og-default.png', width: 1200, height: 630, alt: t('title') }],
        },
        twitter: {
            card: 'summary_large_image',
            title: t('title'),
            description: t('description'),
            images: ['/og-default.png'],
        },

        // The name under the icon once this is saved to a home screen, and
        // the promise that it opens without Safari's address bar. The icons
        // themselves are app/icon.png and app/apple-icon.png, which Next
        // wires up by their filenames.
        manifest: '/manifest.webmanifest',
        appleWebApp: {
            capable: true,
            title: "Mo'sCookbook",
            // The page is cream and the status bar should be too; `default`
            // draws it as an opaque light bar rather than letting the content
            // run under it.
            statusBarStyle: 'default',
        },
    };
}

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // Ensure that the incoming `locale` is valid
    if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
        notFound();
    }

    // Not the whole file: see i18n/clientMessages. The admin layout sends the
    // rest to the pages that need it.
    const messages = publicClientMessages(await getMessages());
    const tSite = await getTranslations({ locale, namespace: 'Site' });

    return (
        <html lang={locale}>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <NextIntlClientProvider messages={messages}>
                    {/* Makes an already-opened recipe readable with no signal.
                        Registers after load, never blocks anything, and is
                        network-first — see public/sw.js. */}
                    {/* The first stop for Tab: past the navigation to the page.
                        Hidden until focused. */}
                    <a
                        href="#content"
                        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-lg focus:bg-page focus:px-4 focus:py-2 focus:shadow-lg"
                    >
                        {tSite('skipToContent')}
                    </a>
                    <ServiceWorker />
                    <GlobalErrorReporter />
                    {/* Suspense because it reads the search params, which
                        would otherwise hold the whole layout back. */}
                    <Suspense fallback={null}>
                        <NavigationProgress />
                    </Suspense>
                    <Navbar locale={locale} />
                    <VerifyBanner />
                    <div id="content" tabIndex={-1} style={{ minHeight: 'calc(100dvh - 140px)', display: 'flex', flexDirection: 'column', outline: 'none' }}>
                        {children}
                    </div>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
