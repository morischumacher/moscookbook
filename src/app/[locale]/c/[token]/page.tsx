import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { collectionByToken } from '@/lib/collectionQuery';
import CollectionIntro from '@/components/collection/CollectionIntro';
import CollectionGrid from '@/components/collection/CollectionGrid';
import Logo from '@/components/brand/Logo';
import { getSiteUrl } from '@/lib/siteUrl';
import { shareUrl } from '@/lib/shareToken';
import { pageContainer, pageTop } from '@/lib/ui';

/**
 * A collection somebody was sent.
 *
 * The recipes are shown by name and picture and go nowhere: the link was to a
 * menu, not to a way into a private cookbook. That is the same rule the shared
 * recipe page follows in the other direction — there you get the whole recipe,
 * because the whole recipe is what was shared.
 *
 * Deliberately plain. Whoever opens this has no account and may never want one;
 * the page's job is to be readable and to say where it came from.
 */

// Deduped between generateMetadata and the page, so the link is read once.
const load = cache(collectionByToken);

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string; token: string }>;
}): Promise<Metadata> {
    const { locale, token } = await params;
    const collection = await load(token);

    if (!collection) return { title: 'Mo’sCookbook' };

    const t = await getTranslations({ locale, namespace: 'Collections' });
    const url = shareUrl(getSiteUrl(), locale, token, 'collection');

    return {
        title: collection.title,
        description: collection.description ?? t('sharedBy'),
        alternates: { canonical: url },
        openGraph: {
            type: 'article',
            title: collection.title,
            description: collection.description ?? t('sharedBy'),
            url,
        },
    };
}

export default async function SharedCollectionPage({
    params,
}: {
    params: Promise<{ locale: string; token: string }>;
}) {
    const { token } = await params;
    const collection = await load(token);

    if (!collection) notFound();

    const t = await getTranslations('Collections');

    return (
        <main className={`${pageContainer} pb-32`}>
            <div className={pageTop}>
                <CollectionIntro
                    title={collection.title}
                    description={collection.description}
                    imageUrl={collection.imageUrl ?? collection.recipes[0]?.imageUrl ?? null}
                    meta={t('recipeCount', { count: collection.recipes.length })}
                />
            </div>

            <div className="mt-8">
                {/* linkTo null: there is nowhere to send somebody who has no
                    account, and a tile leading to a sign-in form is a tile
                    that lied. */}
                <CollectionGrid recipes={collection.recipes} linkTo={null} />
            </div>

            <footer className="mt-16 flex flex-col items-center gap-3 border-t border-line pt-8">
                <Logo height={32} />
                <p className="text-xs uppercase tracking-widest text-faint">{t('sharedBy')}</p>
            </footer>
        </main>
    );
}
