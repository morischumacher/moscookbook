import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import CollectionForm from '@/components/collection/CollectionForm';
import { pageContainer, pageTop, pageHeading } from '@/lib/ui';

export default async function NewCollectionPage() {
    const t = await getTranslations('Collections');

    // By name, for the picker. Only the two columns it shows.
    const recipes: { id: number; title: string }[] = await prisma.recipe.findMany({
        orderBy: { title: 'asc' },
        take: 500,
        select: { id: true, title: true },
    });

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-8`}>{t('newTitle')}</h1>

            <CollectionForm
                initial={{ title: '', description: '', recipeIds: [] }}
                recipes={recipes}
            />
        </main>
    );
}
