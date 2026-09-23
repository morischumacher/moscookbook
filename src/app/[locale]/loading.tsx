import { getTranslations } from 'next-intl/server';
import Loading from '@/components/ui/Loading';
import { Skeleton, TileGridSkeleton } from '@/components/ui/Skeleton';
import { pageContainer, pageTop } from '@/lib/ui';

/**
 * What every page shows while the server is still putting it together, unless
 * its own folder says otherwise: the front page's shape, and the oyster.
 *
 * Without it a tap on a link changed nothing on screen until the whole next
 * page had been rendered, which on a slow evening was long enough to tap
 * again. With it the navigation answers at once.
 */
export default async function PageLoading() {
    const t = await getTranslations('Loading');

    return (
        <main className={`${pageContainer} ${pageTop} pb-32`}>
            <Loading label={t('recipes')} size={28} />
            <Skeleton className="mt-8 h-8 w-2/3" />
            <div className="mt-6 flex gap-2" aria-hidden="true">
                <Skeleton className="h-8 w-20 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
                <Skeleton className="h-8 w-16 rounded-full" />
            </div>
            <TileGridSkeleton />
        </main>
    );
}
