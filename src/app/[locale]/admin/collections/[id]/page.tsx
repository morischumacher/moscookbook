import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import prisma from '@/lib/prisma';
import { recipeOptions } from '@/lib/pickOptions';
import CollectionForm from '@/components/collection/CollectionForm';
import { pageContainer, pageTop, pageHeading } from '@/lib/ui';

export default async function EditCollectionPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: raw } = await params;
    const id = Number.parseInt(raw, 10);
    if (!Number.isInteger(id)) notFound();

    const t = await getTranslations('Collections');

    const collection: {
        id: number;
        title: string;
        description: string | null;
        imageUrl: string | null;
        recipes: { recipeId: number }[];
    } | null = await prisma.collection.findUnique({
        where: { id },
        select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            recipes: { orderBy: { position: 'asc' }, select: { recipeId: true } },
        },
    });

    if (!collection) notFound();

    const recipes = await recipeOptions();

    return (
        <main className={`${pageContainer} pb-32`}>
            <h1 className={`${pageTop} ${pageHeading} mb-8`}>{t('editTitle')}</h1>

            <CollectionForm
                initial={{
                    id: collection.id,
                    title: collection.title,
                    description: collection.description ?? '',
                    imageUrl: collection.imageUrl ?? '',
                    recipeIds: collection.recipes.map((row) => row.recipeId),
                }}
                recipes={recipes}
            />
        </main>
    );
}
