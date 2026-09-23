import RecipeForm from '@/components/recipe-form/RecipeForm';
import { canUseAi } from '@/lib/aiProviders';
import { aiCapability } from '@/lib/aiConfig';
import prisma from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { slugify } from '@/lib/recipe';
import { draftFromJson } from '@/lib/captureDraft';
import { collectionFacets } from '@/lib/collectionFacets';
import { mirrorImageToBlob } from '@/lib/mirrorImage';
import { positiveIntId } from '@/lib/routeParams';

/**
 * The new-recipe form, optionally opened on a capture from the inbox.
 *
 * The draft is read here on the server rather than fetched by the form: the
 * page then arrives already filled in, which is the whole point of the inbox —
 * a capture that needs a minute of attention should cost a minute, not a
 * spinner and then a minute.
 */
export default async function CreateRecipePage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { capture: captureParam } = await searchParams;

    const captureId = positiveIntId(typeof captureParam === 'string' ? captureParam : null);

    let initial: Record<string, unknown> | undefined;

    if (captureId !== null) {
        // The form is a client component and cannot check the session itself,
        // so the draft is only read once this page has.
        const auth = await requireAdmin();
        if ('response' in auth) return null;

        const capture = await prisma.capture.findUnique({
            where: { id: captureId },
            select: { draft: true },
        });

        const draft = draftFromJson(capture?.draft);

        if (draft) {
            initial = {
                title: draft.title,
                slug: draft.title ? slugify(draft.title) : '',
                description: draft.description,
                category: draft.category,
                nationality: draft.nationality,
                // The gallery reads `imageUrls`; the single field was ignored,
                // so the picture was missing — and saving then told the
                // server the recipe kept none of the capture's screenshots.
                // Mirrored first, in case a retry left a foreign address.
                imageUrls: draft.imageUrl ? [await mirrorImageToBlob(draft.imageUrl)].filter(Boolean) : [],
                instructions: draft.instructions,
                ingredients: draft.ingredients,
                servings: draft.servings,
                prepMinutes: draft.prepMinutes,
                cookMinutes: draft.cookMinutes,
            };
        }
    }

    // Decided on the server: without an API key the AI tab is simply absent,
    // and paste-and-parse plus URL import carry the whole flow.
    return (
        <RecipeForm
            knownCategories={(await collectionFacets()).categories.map((facet) => facet.value)}
            mode="create"
            aiEnabled={canUseAi(await aiCapability())}
            initial={initial}
            captureId={captureId ?? undefined}
        />
    );
}
