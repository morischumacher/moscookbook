import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import "../globals.css";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

const playfair = Playfair_Display({
    variable: "--font-serif",
    subsets: ["latin"],
});

export const metadata = {
    title: "Mo's Cookbook",
    description: "A collection of my favorite recipes",
};

export default async function LocaleLayout({
    children,
    params
}: {
    children: React.ReactNode;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;

    // Ensure that the incoming `locale` is valid
    if (!['en', 'de'].includes(locale as any)) {
        notFound();
    }

    // Providing all messages to the client
    // side is the easiest way to get started
    const messages = await getMessages();

    return (
        <html lang={locale}>
            <body className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable}`}>
                <NextIntlClientProvider messages={messages}>
                    <Navbar locale={locale} />
                    <div style={{ minHeight: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
                        {children}
                    </div>
                    <Footer />
                </NextIntlClientProvider>
            </body>
        </html>
    );
}
