import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageContainer, pageTop, pageHeading } from '@/lib/ui';

/**
 * What this site does with data, said in the order somebody would ask.
 *
 * Short, because there is genuinely little to say, and the shortness is the
 * result of decisions rather than of leaving things out: no analytics, no tag
 * manager, no embedded fonts, no advertising, no third-party script of any
 * kind. One cookie, for staying signed in. The error log records a path and a
 * message and neither an address nor an account. Rate-limit rows hold an IP
 * for minutes and are swept.
 *
 * A privacy notice that lists eleven processors and a consent banner is what a
 * site looks like when nobody made those decisions. This one is four sections
 * because the site is four sections' worth of data.
 *
 * Kept as translation keys rather than prose in the markup so that the German
 * and the English say the same thing — which for this document is not a
 * nicety. `npm run check:messages` refuses a key that exists in one language
 * and not the other, so a section cannot quietly go missing from one of them.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Legal' });
    return { title: `${t('privacyTitle')} — mo'scookbook` };
}

/** The sections, in the order the questions come. */
const SECTIONS = [
    'controller',
    'whatData',
    'why',
    'cookies',
    'processors',
    'retention',
    'rights',
] as const;

export default async function PrivacyPage() {
    const t = await getTranslations('Legal');

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <h1 className={pageHeading}>{t('privacyTitle')}</h1>

            <p className="mt-8 font-serif text-lg leading-relaxed text-muted">{t('privacyIntro')}</p>

            <div className="mt-10 flex flex-col gap-8">
                {SECTIONS.map((section) => (
                    <section key={section}>
                        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">
                            {t(`${section}Title`)}
                        </h2>
                        <p className="mt-2 font-serif leading-relaxed text-ink">
                            {t(`${section}Body`)}
                        </p>
                    </section>
                ))}
            </div>

            <p className="mt-10 text-sm leading-relaxed text-muted">{t('privacyUpdated')}</p>
        </main>
    );
}
