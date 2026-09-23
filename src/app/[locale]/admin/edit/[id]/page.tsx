import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { withHeadingRows } from '@/lib/ingredientParts';
import { changedFields, KEEP_REVISIONS, readSnapshot, snapshotOf } from '@/lib/revisions';
import RecipeHistory, { type HistoryEntry } from '@/components/recipe-form/RecipeHistory';
import RecipeForm from '@/components/recipe-form/RecipeForm';
import { canUseAi } from '@/lib/aiProviders';
import { aiCapability } from '@/lib/aiConfig';
import { collectionFacets } from '@/lib/collectionFacets';
import { asLanguage, storedRows } from '@/lib/recipeTranslation';
import { positiveIntId } from '@/lib/routeParams';

interface EditableRecipe {
    tags: string[];
    id: number;
    title: string;
    slug: string;
    description: string | null;
    category: string | null;
    nationality: string | null;
    categories: string[];
    cuisines: string[];
    spiciness: number;
    onlyMe: boolean;
    language: string | null;
    translations: { locale: string; title: string; description: string; instructions: string; ingredients: unknown; source: string }[];
    instructions: string;
    servings: number | null;
    prepMinutes: number | null;
    cookMinutes: number | null;
    images: { url: string }[];
    ingredients: { raw: string; name: string; section: string | null }[];
}

export default async function EditRecipePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    // "12abc" was recipe 12, and a number past INT4 a 500.
    const recipeId = positiveIntId(id);

    if (recipeId === null) notFound();

    const recipe: EditableRecipe | null = await prisma.recipe.findUnique({
        where: { id: recipeId },
        include: {
            images: { orderBy: { position: 'asc' } },
            ingredients: { orderBy: { position: 'asc' } },
            translations: true,
        },
    });

    if (!recipe) notFound();

    // Newest first, each told what the edit after it changed: comparing a
    // version with the one that replaced it, or with today's for the newest.
    const revisions = await prisma.recipeRevision.findMany({
        where: { recipeId },
        orderBy: { createdAt: 'desc' },
        take: KEEP_REVISIONS,
        select: { id: true, createdAt: true, editedBy: true, snapshot: true },
    });
    const now = snapshotOf(recipe);
    const readable = revisions.flatMap((revision) => {
        const snapshot = readSnapshot(revision.snapshot);
        return snapshot ? [{ ...revision, snapshot }] : [];
    });
    const history: HistoryEntry[] = readable.map((revision, index) => ({
        id: revision.id,
        createdAt: revision.createdAt.toISOString(),
        editedBy: revision.editedBy,
        snapshot: revision.snapshot,
        changed: changedFields(revision.snapshot, index === 0 ? now : readable[index - 1].snapshot),
    }));

    return (
        <>
        <RecipeForm
            knownCategories={(await collectionFacets()).categories.map((facet) => facet.value)}
            mode="edit"
            aiEnabled={canUseAi(await aiCapability())}
            initial={{
                id: recipe.id,
                title: recipe.title,
                slug: recipe.slug,
                description: recipe.description ?? '',
                category: recipe.category ?? '',
                nationality: recipe.nationality ?? '',
                instructions: recipe.instructions,
                // Headings come back as rows of their own, where the section
                // changes — the shape the editor writes them in.
                ingredients: withHeadingRows(
                    recipe.ingredients.map((row) => ({ amount: row.raw, item: row.name, section: row.section }))
                ),
                imageUrls: recipe.images.map((image) => image.url),
                servings: recipe.servings,
                prepMinutes: recipe.prepMinutes,
                cookMinutes: recipe.cookMinutes,
                tags: recipe.tags,
                categories: recipe.categories,
                cuisines: recipe.cuisines,
                spiciness: recipe.spiciness,
                language: asLanguage(recipe.language),
                translation: translationOf(recipe.translations[0]),
            }}
        />
        <div className="container mx-auto max-w-3xl px-4 pb-24 md:px-8">
            <RecipeHistory recipeId={recipe.id} entries={history} />
        </div>
        </>
    );
}

function translationOf(row: EditableRecipe['translations'][number] | undefined) {
    const locale = asLanguage(row?.locale);
    if (!row || !locale) return null;
    return { ...row, locale, ingredients: storedRows(row.ingredients) };
}
