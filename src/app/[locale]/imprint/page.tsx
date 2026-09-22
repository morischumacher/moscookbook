import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageContainer, pageTop, pageHeading } from '@/lib/ui';

/**
 * The disclosure a published page needs.
 *
 * Nothing here is required while every recipe is private: a cookbook behind a
 * sign-in form for two people is addressed to nobody, and neither the
 * E-Commerce-Gesetz nor the Mediengesetz has anything to say about it. It
 * becomes required with the first public recipe, and it exists now so that
 * publishing one is a single decision rather than a decision plus a legal
 * errand.
 *
 * What it says is deliberately the minimum. § 5 ECG governs commercial
 * services — a shop, a site living off advertising or sponsorship — and this
 * is none of those. § 25 Abs 5 MedienG covers a "small website" whose content
 * does not go beyond the presentation of a personal sphere of life, and asks
 * for two things: a name and a place of residence. A hobby cookbook is exactly
 * that, so two things is what this page has.
 *
 * The moment there are advertisements, affiliate links or anything sold, that
 * stops being true and this page needs the full disclosure with an address
 * that can receive official post. The note at the bottom says so, to whoever
 * is reading this file in two years having just added a banner.
 */
export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const t = await getTranslations({ locale, namespace: 'Legal' });
    return { title: `${t('imprintTitle')} — mo'scookbook` };
}

export default async function ImprintPage() {
    const t = await getTranslations('Legal');

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <h1 className={pageHeading}>{t('imprintTitle')}</h1>

            <dl className="mt-8 flex flex-col gap-6 font-serif">
                <div>
                    <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                        {t('operator')}
                    </dt>
                    <dd className="mt-1 text-ink">{t('operatorName')}</dd>
                </div>

                <div>
                    <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                        {t('residence')}
                    </dt>
                    <dd className="mt-1 text-ink">{t('residenceValue')}</dd>
                </div>

                <div>
                    <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                        {t('contact')}
                    </dt>
                    <dd className="mt-1 text-ink">{t('contactValue')}</dd>
                </div>

                <div>
                    <dt className="text-xs font-bold uppercase tracking-widest text-muted">
                        {t('purpose')}
                    </dt>
                    <dd className="mt-1 text-ink">{t('purposeValue')}</dd>
                </div>
            </dl>

            <p className="mt-10 text-sm leading-relaxed text-muted">{t('imprintBasis')}</p>
        </main>
    );
}
