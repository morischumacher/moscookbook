import { NextRequest, NextResponse } from 'next/server';
import { isPrismaError } from '@/lib/prismaErrors';
import prisma from '@/lib/prisma';
import { forgetCollectionFacets } from '@/lib/collectionFacets';
import { requireAdmin } from '@/lib/auth';
import { deleteBlobs } from '@/lib/blobCleanup';
import { toStructuredIngredients } from '@/lib/ingredientParts';
import { recipeInputSchema, formatZodError, resolveImageUrls } from '@/lib/recipeSchema';
import { ingredientRows as positioned, keptTranslation, recipeColumns, translationRow } from '@/lib/recipeRepo';
import { changedFields, snapshotOf } from '@/lib/revisions';
import { keepRevisionOf } from '@/lib/revisionsDb';
import { positiveIntId } from '@/lib/routeParams';
import { failed } from '@/lib/reportServerError';
import { versionOf } from '@/lib/recipeVersion';

function parseRecipeId(raw: string): number | null {
    return positiveIntId(raw);
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await context.params;
        const recipeId = parseRecipeId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        const body = await req.json().catch(() => null);
        const parsed = recipeInputSchema.safeParse(body);
        // Outside the schema, like captureId on create: not part of a recipe.
        const rawVersion = (body as { baseVersion?: unknown } | null)?.baseVersion;
        const baseVersion = typeof rawVersion === 'string' ? rawVersion : null;

        if (!parsed.success) {
            return NextResponse.json(
                { message: formatZodError(parsed.error) },
                { status: 400 }
            );
        }

        const {
            title, slug, description, category, nationality,
            ingredients, instructions,
            servings, prepMinutes, cookMinutes,
        } = parsed.data;

        // null means the request said nothing about pictures, which is not the
        // same as an empty list. Saving an edit without touching the gallery
        // must not empty it — that bug has been fixed here once already.
        const imageUrls = resolveImageUrls(parsed.data);

        const replaceImages = imageUrls !== null;

        // Ingredient rows are replaced wholesale rather than diffed: the list is
        // short, order matters, and a rewrite keeps positions contiguous.
        const structured = toStructuredIngredients(ingredients);
        const ingredientRows = positioned(structured).map((row) => ({ ...row, recipeId }));

        const sentTranslation = parsed.data.translation;
        const language = parsed.data.language;

        /*
         * Everything the write depends on, read at once: none of these reads
         * needs another's answer, and each one used to be its own round trip
         * before the next could start.
         *
         * - The pictures as they are now, in their order. Wanted twice: for
         *   the files this edit is about to stop pointing at, and for the
         *   version check below. It used to be read once for each.
         * - The version this edit replaces, kept so it can be looked at and
         *   undone (lib/revisions).
         * - The translation, when the form did not send one (see below).
         */
        const [pictures, before, keptTranslationRow] = await Promise.all([
            replaceImages || baseVersion
                ? prisma.image.findMany({ where: { recipeId }, orderBy: { position: 'asc' }, select: { url: true } })
                : [],
            prisma.recipe.findUnique({
                where: { id: recipeId },
                select: {
                    title: true, slug: true, description: true, category: true, nationality: true,
                    instructions: true, servings: true, prepMinutes: true, cookMinutes: true, tags: true,
                    ingredients: { orderBy: { position: 'asc' }, select: { raw: true, name: true, section: true } },
                },
            }),
            sentTranslation === undefined ? keptTranslation(recipeId) : null,
        ]);

        // Which files this edit is about to stop pointing at. Read before the
        // write, because after it there is nothing left to ask. Deleting a
        // recipe has always taken its pictures with it; editing one quietly did
        // not, so every photograph ever removed or reordered out of a recipe
        // stayed in the store, unreachable and still paid for.
        const droppedUrls: string[] = [];

        if (replaceImages) {
            const kept = new Set(imageUrls ?? []);
            for (const image of pictures) {
                if (!kept.has(image.url)) droppedUrls.push(image.url);
            }
        }

        // Only when something the history shows actually changed: saving
        // twice is not two versions.
        const previous = before ? snapshotOf(before) : null;

        // Opened on another version than this one: somebody saved (or
        // restored an older version) in the meantime. Writing now would undo
        // that without anybody seeing it.
        if (baseVersion && previous) {
            if (versionOf(previous, pictures.map((picture) => picture.url)) !== baseVersion) {
                return NextResponse.json({ message: 'This recipe was changed elsewhere since you opened it.', conflict: true }, { status: 409 });
            }
        }
        const next = snapshotOf({
            title, slug, description, category, nationality, instructions,
            servings: servings ?? null, prepMinutes: prepMinutes ?? null, cookMinutes: cookMinutes ?? null,
            tags: parsed.data.tags,
            ingredients: structured.map((row) => ({ raw: row.raw, name: row.name, section: row.section ?? null })),
        });
        const keepRevision = previous !== null && changedFields(previous, next).length > 0;

        // The translation: replaced when the form sent one (or null to drop
        // it), otherwise kept — and then still read, so the search columns
        // rewritten below go on finding the recipe in both languages.
        const translation = sentTranslation !== undefined ? sentTranslation : keptTranslationRow;
        const newTranslation = sentTranslation !== undefined ? translationRow(sentTranslation, language) : null;

        const [updatedRecipe] = await prisma.$transaction([
            prisma.recipe.update({
                where: { id: recipeId },
                data: recipeColumns({
                    title,
                    slug,
                    description,
                    category,
                    nationality,
                    instructions,
                    servings,
                    prepMinutes,
                    cookMinutes,
                    ingredients: structured,
                    tags: parsed.data.tags,
                    categories: parsed.data.categories,
                    cuisines: parsed.data.cuisines,
                    spiciness: parsed.data.spiciness,
                    language,
                    translation,
                    onlyMe: parsed.data.onlyMe,
                }),
            }),
            ...(sentTranslation !== undefined ? [prisma.recipeTranslation.deleteMany({ where: { recipeId } })] : []),
            ...(newTranslation ? [prisma.recipeTranslation.create({ data: { ...newTranslation, recipeId } })] : []),
            prisma.ingredient.deleteMany({ where: { recipeId } }),
            prisma.ingredient.createMany({ data: ingredientRows }),
            // Replaced wholesale rather than diffed, like the ingredients: the
            // list is short, the order is what the author arranged, and a
            // rewrite keeps positions contiguous.
            ...(replaceImages ? [prisma.image.deleteMany({ where: { recipeId } })] : []),
            ...(replaceImages && imageUrls && imageUrls.length > 0
                ? [
                    prisma.image.createMany({
                        data: imageUrls.map((url, index) => ({ recipeId, url, position: index })),
                    }),
                ]
                : []),
        ]);

        // After the transaction, never inside it: a file cannot be un-deleted
        // if the write rolls back, and a row pointing at a missing picture is a
        // worse outcome than a file nobody points at.
        if (droppedUrls.length > 0) await deleteBlobs(droppedUrls);

        if (keepRevision && previous) await keepRevisionOf(recipeId, previous, auth.user.name);

        // The category or cuisine may have changed, and with it the rail.
        forgetCollectionFacets();

        return NextResponse.json(updatedRecipe, { status: 200 });
    } catch (error) {
        if (isPrismaError(error, 'P2002')) {
            return NextResponse.json(
                { message: 'A recipe with this slug already exists. Please choose a different one.' },
                { status: 409 }
            );
        }
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('Update recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin();
    if ('response' in auth) return auth.response;

    try {
        const { id } = await context.params;
        const recipeId = parseRecipeId(id);

        if (recipeId === null) {
            return NextResponse.json({ message: 'Invalid recipe ID' }, { status: 400 });
        }

        // The URLs are read before the row goes, because afterwards there is
        // nothing left to read them from. Rows first, files second: a delete
        // that removed the files and then failed on the row would leave a
        // recipe pointing at pictures that no longer exist, which is worse
        // than a file nobody is pointing at.
        const doomed: {
            images: { url: string }[];
            cookEntries: { photos: { url: string }[] }[];
        } | null = await prisma.recipe.findUnique({
            where: { id: recipeId },
            select: {
                images: { select: { url: true } },
                cookEntries: { select: { photos: { select: { url: true } } } },
            },
        });

        // Images, cooking entries with their photographs, ratings and
        // favourites all cascade on delete in the schema, so removing the
        // recipe is enough for the rows.
        await prisma.recipe.delete({ where: { id: recipeId } });

        if (doomed) {
            await deleteBlobs([
                ...doomed.images.map((image) => image.url),
                ...doomed.cookEntries.flatMap((entry) =>
                    entry.photos.map((photo) => photo.url)
                ),
            ]);
        }

        // One fewer recipe, and possibly one fewer category.
        forgetCollectionFacets();

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        if (isPrismaError(error, 'P2025')) {
            return NextResponse.json({ message: 'Recipe not found' }, { status: 404 });
        }

        failed('Delete recipe error:', error);
        return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
    }
}
