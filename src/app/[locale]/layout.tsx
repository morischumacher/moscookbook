import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { getSiteUrl } from '@/lib/siteUrl';
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VerifyBanner from "@/components/auth/VerifyBanner";
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

    // Providing all messages to the client
    // side is the easiest way to get started
    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body className={`${geistSans.variable} ${geistMono.variable}`}>
                <NextIntlClientProvider messages={messages}>
                    <Navbar locale={locale} />
                    <VerifyBanner />
                    <div style={{ minHeight: 'calc(100dvh - 140px)', display: 'flex', flexDirection: 'column' }}>
                        {children}
                    </div>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
