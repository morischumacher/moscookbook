import { getTranslations } from 'next-intl/server';
import Loading from '@/components/ui/Loading';
import { ListSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { pageContainer, pageTop } from '@/lib/ui';

/** The list's outline while it is read. See app/[locale]/loading.tsx. */
export default async function BlogLoading() {
    const t = await getTranslations('Loading');

    return (
        <main className={`${pageContainer} ${pageTop}`}>
            <Loading label={t('entries')} size={28} />
            <Skeleton className="mt-8 h-8 w-1/2" />
            <ListSkeleton />
        </main>
    );
}
