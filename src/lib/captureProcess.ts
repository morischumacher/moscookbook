import type { CaptureSource, CaptureStatus } from './capture';
import { withoutBareUrls } from './capture';
import type { ImportedRecipe } from './recipeFromHtml';
import { extractRecipeFromHtml } from './recipeFromHtml';
import { parseRecipeText } from './recipeParser';
import { fetchPage } from './fetchPage';
import { youtubeVideoId, extractYoutubePage, cleanYoutubeDescription } from './youtube';

/**
 * Turning a capture into a recipe draft.
 *
 * Every path here is rule-based and needs no API key, because the cookbook has
 * to keep working on a month when there is no AI budget. Where a source simply
 * cannot be read without one — a video whose recipe is only spoken, a
 * photographed page — the capture comes back as `needsWork` with whatever was
 * found, rather than as a confident guess.
 *
 * Nothing in here throws for an unreadable source: a capture that cannot be
 * parsed is a capture waiting for a better parser, not an error.
 */

export interface ProcessedCapture {
    status: Extract<CaptureStatus, 'ready' | 'needsWork' | 'failed'>;
    draft: ImportedRecipe | null;
    /** Shown in the inbox. A reason, not a stack trace. */
    error: string | null;
}

export interface ProcessableCapture {
    kind: string;
    source: string;
    sourceUrl: string | null;
    rawText: string | null;
    /** Only set once a photograph has been uploaded. */
    imageUrl?: string | null;
}

function emptyDraft(sourceUrl: string): ImportedRecipe {
    return {
        title: '',
        description: '',
        ingredients: [],
        instructions: '',
        imageUrl: '',
        category: '',
        nationality: '',
        servings: null,
        prepMinutes: null,
        cookMinutes: null,
        sourceUrl,
    };
}

/**
 * Enough to publish without opening the editor?
 *
 * A title alone is not a recipe, and neither is a list of ingredients with no
 * method. Anything short of both is `needsWork` — which does not mean broken,
 * only that it wants a human for a minute.
 */
function completeness(draft: ImportedRecipe): 'ready' | 'needsWork' {
    const hasTitle = draft.title.trim() !== '';
    const hasIngredients = draft.ingredients.length > 0;
    const hasInstructions = draft.instructions.trim() !== '';
    return hasTitle && hasIngredients && hasInstructions ? 'ready' : 'needsWork';
}

/** Fills the gaps in `draft` from `fallback`, without overwriting real data. */
function mergeDrafts(draft: ImportedRecipe, fallback: Partial<ImportedRecipe>): ImportedRecipe {
    return {
        ...draft,
        title: draft.title || (fallback.title ?? ''),
        description: draft.description || (fallback.description ?? ''),
        ingredients: draft.ingredients.length > 0 ? draft.ingredients : (fallback.ingredients ?? []),
        instructions: draft.instructions || (fallback.instructions ?? ''),
        imageUrl: draft.imageUrl || (fallback.imageUrl ?? ''),
    };
}

async function processYoutube(url: string, rawText: string | null): Promise<ProcessedCapture> {
    const videoId = youtubeVideoId(url);
    if (!videoId) {
        return { status: 'failed', draft: null, error: 'Not a YouTube video link.' };
    }

    const page = await fetchPage(url);
    if (!page.ok) {
        return {
            status: 'failed',
            draft: null,
            error: `YouTube could not be read (${page.failure}).`,
        };
    }

    const video = extractYoutubePage(page.html, videoId);
    const description = cleanYoutubeDescription(video.description);
    const parsed = parseRecipeText(description);

    const draft: ImportedRecipe = {
        ...emptyDraft(url),
        ...parsed,
        imageUrl: video.imageUrl,
        // The video's own title wins outright rather than filling a gap. The
        // parser names a recipe after the first line it is given, and the first
        // line of a description is a sentence — "Viel Spaß beim Nachkochen!"
        // is what that produced before this was an override.
        //
        // No invented description either: a line like "from a video by X" would
        // be written in one language into a cookbook that has two. Attribution
        // belongs to `sourceUrl`, which the recipe page can render in whichever
        // language the reader chose.
        title: video.title || parsed.title,
    };

    // The description often is not the recipe at all. Whatever was shared
    // alongside the link is then the better source.
    const shared = rawText ? withoutBareUrls(rawText) : '';
    const fromShare = shared ? parseRecipeText(shared) : null;
    const merged = fromShare ? mergeDrafts(draft, fromShare) : draft;

    const status = completeness(merged);

    return {
        status,
        draft: merged,
        error:
            status === 'ready'
                ? null
                : 'The description did not hold a full recipe — it may only be spoken in the video.',
    };
}

async function processWebPage(url: string, rawText: string | null): Promise<ProcessedCapture> {
    const page = await fetchPage(url);

    if (!page.ok) {
        // A page that cannot be fetched is not the end: Instagram blocks
        // readers, but its share carries the caption, and that is often the
        // whole recipe.
        const shared = rawText ? withoutBareUrls(rawText) : '';
        if (shared) {
            const parsed = parseRecipeText(shared);
            const draft = { ...emptyDraft(url), ...parsed };
            return {
                status: completeness(draft),
                draft,
                error: 'The page could not be read; the shared text was used instead.',
            };
        }
        return {
            status: 'failed',
            draft: null,
            error: `The page could not be read (${page.failure}).`,
        };
    }

    const extracted = extractRecipeFromHtml(page.html, page.finalUrl);
    const shared = rawText ? withoutBareUrls(rawText) : '';
    const fromShare = shared ? parseRecipeText(shared) : null;
    const draft = fromShare ? mergeDrafts(extracted, fromShare) : extracted;

    const status = completeness(draft);
    return {
        status,
        draft,
        error: status === 'ready' ? null : 'The page held only part of a recipe.',
    };
}

export async function processCapture(capture: ProcessableCapture): Promise<ProcessedCapture> {
    try {
        if (capture.kind === 'image') {
            return {
                status: 'needsWork',
                draft: null,
                error: 'A photograph needs the AI import, or typing it in.',
            };
        }

        if (capture.kind === 'text') {
            const text = withoutBareUrls(capture.rawText ?? '');
            if (text.trim() === '') {
                return { status: 'failed', draft: null, error: 'Nothing was sent.' };
            }
            const draft = { ...emptyDraft(''), ...parseRecipeText(text) };
            return {
                status: completeness(draft),
                draft,
                error: completeness(draft) === 'ready' ? null : 'Only part of a recipe was recognised.',
            };
        }

        const url = capture.sourceUrl;
        if (!url) {
            return { status: 'failed', draft: null, error: 'No link to follow.' };
        }

        const source = capture.source as CaptureSource;
        return source === 'youtube'
            ? await processYoutube(url, capture.rawText)
            : await processWebPage(url, capture.rawText);
    } catch (error) {
        // The raw capture is still in the database, so this is recoverable:
        // the inbox offers a retry once the cause is fixed.
        console.error('Capture processing error:', error);
        return { status: 'failed', draft: null, error: 'Something went wrong while reading this.' };
    }
}
