import { readReason, type ReasonCode } from './captureReasons';

/**
 * What an inbox row that did not come in complete needs from you, and the
 * buttons for it.
 *
 * Every row in the inbox is waiting for a decision — that is what the inbox
 * is — but a row that read completely needs one kind (take it, or not) and a
 * row that did not needs another: read it with the AI, finish it by hand,
 * look at the source, or throw it away. Those rows used to look exactly like
 * the complete ones, with the same "edit first" button and the real choices
 * folded under "More". Now each reason says what it is and offers the steps
 * that fit it, the likeliest first.
 */

export type Step = 'askAi' | 'retry' | 'edit' | 'openSource' | 'discard';
export type Situation = 'noRecipe' | 'elsewhere' | 'spoken' | 'picture' | 'partial' | 'failed' | 'incomplete';

export interface Decision {
    situation: Situation;
    /** Most likely first; the first one is drawn as the button. */
    steps: Step[];
    /** The AI would have been the right step but is switched off. */
    aiWouldHelp: boolean;
}

const GROUPS: Record<Situation, ReasonCode[]> = {
    noRecipe: ['noRecipe'],
    elsewhere: ['recipeInBio', 'recipeInComments', 'recipeByDm'],
    spoken: ['videoSpoken', 'videoSpokenNeedsAi'],
    picture: ['pictureNeedsAi'],
    partial: ['pagePartial', 'videoPartial', 'textPartial', 'picturePartial', 'sharedTextUsed'],
    failed: ['pageUnreadable', 'youtubeUnreadable', 'somethingWrong', 'pictureFailed', 'pictureUnreadable', 'noPicture', 'nothingSent', 'noLink', 'notYoutube'],
    incomplete: [],
};

const STEPS: Record<Situation, Step[]> = {
    // Nothing to keep: the answer is to throw it away.
    noRecipe: ['discard', 'openSource'],
    // The recipe is on another page: go and get it.
    elsewhere: ['openSource', 'discard'],
    // Subtitles for the AI to read, or the video to watch and type up.
    spoken: ['askAi', 'openSource', 'edit', 'discard'],
    picture: ['askAi', 'edit', 'discard'],
    partial: ['edit', 'askAi', 'discard'],
    failed: ['retry', 'askAi', 'openSource', 'discard'],
    incomplete: ['edit', 'askAi', 'discard'],
};

export function situationOf(error: string | null): Situation {
    const reason = readReason(error);
    if (!reason) return 'incomplete';
    for (const [situation, codes] of Object.entries(GROUPS) as [Situation, ReasonCode[]][]) {
        if (codes.includes(reason.code)) return situation;
    }
    return 'incomplete';
}

export function decisionFor(
    capture: { status: string; error: string | null; sourceUrl: string | null },
    aiAvailable: boolean
): Decision | null {
    if (capture.status !== 'needsWork' && capture.status !== 'failed') return null;
    const situation = situationOf(capture.error);
    const wanted = STEPS[situation];
    const steps = wanted.filter(
        (step) =>
            (step !== 'askAi' || aiAvailable) &&
            // No link, nothing to open or to read again from it.
            ((step !== 'openSource' && step !== 'retry') || capture.sourceUrl !== null)
    );
    return {
        situation,
        steps: steps.length > 0 ? steps : ['edit', 'discard'],
        aiWouldHelp: !aiAvailable && wanted.indexOf('askAi') === 0,
    };
}
